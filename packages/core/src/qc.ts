import { captionBox, captionLineCount, outputFaceCy, safeArea } from "./captions";
import type { EditDoc } from "./editModel";
import { isPinned } from "./ops";
import { toTimeline } from "./timeline";

/**
 * The quality check every export passes before it is handed over (docs/goal-plan-build.md §4). Pure: `qcDoc` reads
 * the edit, `qcMedia` reads numbers measured on the rendered file, `qcVerdict` decides. Measuring is the renderer's
 * job (the browser samples its own frames; the worker asks ffmpeg); deciding lives here so both agree.
 *
 * `ours` separates our faults from the person's choices and footage: a black or frozen export is ours; audio that
 * already clips in the take, or a cut the person placed themselves, is theirs. `gate` says what the export does about it: "block" (never delivered),
 * "ask" (the person may export anyway) or "note" (delivered; recorded so the cut rules can be tuned).
 */
export type QcCode =
  | "empty"
  | "mid_word_cut"
  | "flash_segment"
  | "caption_overflow"
  | "caption_overlap"
  | "caption_band"
  | "wrong_length"
  | "black_frames"
  | "frozen_frames"
  | "clipping"
  | "silent";

export interface QcIssue {
  code: QcCode;
  /** where it is on the export's timeline */
  atMs: number;
  spanMs: number;
  /** our fault, or the person's own choice or footage */
  ours: boolean;
  /** block: never delivered · ask: "export anyway" is offered · note: delivered, recorded */
  gate: "block" | "ask" | "note";
  /** one plain line for the person */
  message: string;
}

export const QC = {
  /** a cut may sit this far inside a word's timing before it counts as mid-word (ASR edges are soft) */
  wordEdgeToleranceMs: 20,
  /** a kept piece shorter than this reads as a glitch */
  flashMs: 200,
  /** two lines of 18 characters at 9:16 */
  captionMaxChars: 36,
  blackLuma: 0.02,
  blackMs: 500,
  frozenDiff: 0.0005,
  frozenMs: 1000,
  clipPeakDb: -0.3,
  clippedRatio: 0.001,
  silentRmsDb: -60,
  lengthToleranceMs: 250,
  lengthToleranceRatio: 0.02,
} as const;

const tc = (ms: number) => {
  const s = Math.floor(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/** Did the person place this cut? True when the silence cut or bead edge at `srcMs` is one they touched (pinned). */
function theirs(doc: EditDoc, clipId: string, srcMs: number): boolean {
  const at = (ms: number) => Math.abs(ms - srcMs) <= 1;
  for (const b of doc.beads) {
    if (b.clipId !== clipId || b.struck) continue;
    const bead = `/beads/@${b.id}`;
    if ((at(b.inMs) && isPinned(doc.pins, `${bead}/inMs`)) || (at(b.outMs) && isPinned(doc.pins, `${bead}/outMs`))) return true;
    for (const c of b.cuts) {
      if (!c.struck || !(at(c.startMs) || at(c.endMs))) continue;
      const cut = `${bead}/cuts/@${c.id}`;
      // pinned itself, or a field of it (the person dragged an edge or struck it)
      if (isPinned(doc.pins, cut) || doc.pins.some((p) => p.startsWith(cut + "/"))) return true;
    }
  }
  return false;
}

/** Problems visible in the edit itself, before anything is rendered. */
export function qcDoc(doc: EditDoc, opts: { captionMaxChars?: number } = {}): QcIssue[] {
  const { segments: pieces, captions, durationMs } = toTimeline(doc);
  // beads tile the take, so two pieces that meet in source time play straight through: only a jump is a cut
  const segments: typeof pieces = [];
  for (const p of pieces) {
    const last = segments.at(-1);
    if (last && last.clipId === p.clipId && Math.abs(last.toMs - p.fromMs) <= 1) segments[segments.length - 1] = { ...last, toMs: p.toMs };
    else segments.push(p);
  }
  const issues: QcIssue[] = [];
  if (durationMs < QC.flashMs) {
    return [{ code: "empty", atMs: 0, spanMs: durationMs, ours: false, gate: "block", message: "nothing is left in this edit · restore a bead first" }];
  }

  // kept words per clip, in source time
  const kept = new Map<string, { startMs: number; endMs: number; text: string }[]>();
  for (const b of doc.beads) {
    if (b.struck) continue;
    const list = kept.get(b.clipId) ?? [];
    for (const w of b.words) if (!w.struck) list.push(w);
    kept.set(b.clipId, list);
  }
  const tol = QC.wordEdgeToleranceMs;
  let out = 0;
  segments.forEach((s, i) => {
    const len = s.toMs - s.fromMs;
    // a short piece that holds a whole word ("a", "I") is speech; one that holds none is a fragment that flashes by
    const words = kept.get(s.clipId) ?? [];
    if (len < QC.flashMs && !words.some((w) => w.startMs >= s.fromMs - tol && w.endMs <= s.toMs + tol)) {
      // autocut leaves these today (the breath kept between a struck filler and a struck pause), so they are noted,
      // not blocked: blocking would refuse ordinary exports. Merging those two cuts is the fix (goal-plan-build §2b).
      issues.push({ code: "flash_segment", atMs: out, spanMs: len, ours: true, gate: "note", message: `a ${len} ms sliver at ${tc(out)} would flash by` });
    }
    // the outer edges of the edit are where the take starts and ends; only cuts between pieces can split a word
    const edges: [number, number][] = [];
    if (i > 0) edges.push([s.fromMs, out]);
    if (i < segments.length - 1) edges.push([s.toMs, out + len]);
    for (const [src, at] of edges) {
      const w = words.find((w) => src > w.startMs + tol && src < w.endMs - tol);
      if (!w) continue;
      // a cut the person placed or moved is their call: say so, and let them keep it
      const mine = theirs(doc, s.clipId, src);
      issues.push({ code: "mid_word_cut", atMs: at, spanMs: 0, ours: !mine, gate: mine ? "ask" : "block", message: `a cut at ${tc(at)} lands inside '${w.text.replace(/[^\p{L}\p{N}'’-]/gu, "")}'` });
    }
    out += len;
  });

  const max = opts.captionMaxChars ?? QC.captionMaxChars;
  captions.forEach((c, i) => {
    // today's chunker counts words, not characters, so five long words can overflow: noted until it counts characters
    if (c.text.length > max) issues.push({ code: "caption_overflow", atMs: c.startMs, spanMs: c.endMs - c.startMs, ours: true, gate: "note", message: `the caption at ${tc(c.startMs)} runs past two lines` });
    const next = captions[i + 1];
    if (next && next.startMs < c.endMs) issues.push({ code: "caption_overlap", atMs: next.startMs, spanMs: c.endMs - next.startMs, ours: true, gate: "block", message: `two captions overlap at ${tc(next.startMs)}` });
  });

  // where the renderers draw the captions (captionBox): inside the platform's safe area and off the face. A caption
  // that can't fit two lines is noted above already, so it is measured as two lines here.
  const safe = safeArea(doc.aspect);
  const face = outputFaceCy(doc, doc.aspect);
  for (const c of captions) {
    const box = captionBox(doc, doc.aspect, Math.min(2, captionLineCount(c.text)));
    const outside = box.top < safe.top - 0.001 || box.bottom > safe.bottom + 0.001;
    const onFace = face !== undefined && face >= box.top && face <= box.bottom;
    if (!outside && !onFace) continue;
    // a spot the person chose is theirs to keep
    const mine = isPinned(doc.pins, `/captions/place/${doc.aspect}`);
    issues.push({ code: "caption_band", atMs: c.startMs, spanMs: c.endMs - c.startMs, ours: !mine, gate: mine ? "ask" : "block", message: onFace ? `the captions at ${tc(c.startMs)} cover the face` : `the captions at ${tc(c.startMs)} sit outside the safe area` });
    break; // one placement for the whole edit, so one line says it
  }
  return issues;
}

/**
 * What a renderer measures on its own output. Frames are sampled every `sampleEveryMs`: `luma` is the mean brightness
 * of each sample (0–1), `diff` the mean absolute change from the previous sample (0–1; the first is 0). The `source*`
 * arrays are the same measures on the take at the matching moments, when the renderer has them: they tell a dark or
 * still take from a broken export.
 */
export interface MediaStats {
  durationMs: number;
  sampleEveryMs: number;
  luma: number[];
  diff: number[];
  sourceLuma?: number[];
  sourceDiff?: number[];
  audio?: { peakDb: number; clippedRatio: number; rmsDb: number; sourcePeakDb?: number };
}

/** Runs of consecutive samples that satisfy `bad`, as [firstIndex, count]. */
function runs(n: number, bad: (i: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  for (let i = 0; i <= n; i++) {
    if (i < n && bad(i)) {
      if (start < 0) start = i;
    } else if (start >= 0) {
      out.push([start, i - start]);
      start = -1;
    }
  }
  return out;
}

/** Problems in the rendered file. `expect` is what the edit says the file should be. */
export function qcMedia(stats: MediaStats, expect: { durationMs: number; hasSpeech: boolean }): QcIssue[] {
  const issues: QcIssue[] = [];
  const step = stats.sampleEveryMs;

  const off = Math.abs(stats.durationMs - expect.durationMs);
  if (off > Math.max(QC.lengthToleranceMs, expect.durationMs * QC.lengthToleranceRatio)) {
    issues.push({ code: "wrong_length", atMs: 0, spanMs: stats.durationMs, ours: true, gate: "block", message: `the export came out ${(stats.durationMs / 1000).toFixed(1)}s, the edit is ${(expect.durationMs / 1000).toFixed(1)}s` });
  }

  // black: dark in the export where the take wasn't (a take that is itself dark is the person's)
  for (const [i, n] of runs(stats.luma.length, (i) => stats.luma[i]! < QC.blackLuma && !((stats.sourceLuma?.[i] ?? 1) < QC.blackLuma))) {
    if (n * step > QC.blackMs) issues.push({ code: "black_frames", atMs: i * step, spanMs: n * step, ours: true, gate: "block", message: `the picture goes black at ${tc(i * step)}` });
  }
  // frozen: no change in the export where the take moved. Index 0 has no previous sample.
  for (const [i, n] of runs(stats.diff.length, (i) => i > 0 && stats.diff[i]! < QC.frozenDiff && !((stats.sourceDiff?.[i] ?? 1) < QC.frozenDiff))) {
    if (n * step > QC.frozenMs) issues.push({ code: "frozen_frames", atMs: i * step, spanMs: n * step, ours: true, gate: "block", message: `the picture freezes at ${tc(i * step)}` });
  }

  const a = stats.audio;
  if (a) {
    if (a.peakDb > QC.clipPeakDb || a.clippedRatio > QC.clippedRatio) {
      // if the take already clipped, that is how it was recorded; if only the export clips, our gain did it
      const inTake = a.sourcePeakDb !== undefined && a.sourcePeakDb > QC.clipPeakDb;
      issues.push({ code: "clipping", atMs: 0, spanMs: stats.durationMs, ours: !inTake, gate: inTake ? "ask" : "block", message: inTake ? "the sound clips in the take itself" : "the sound clips in the export" });
    }
    if (expect.hasSpeech && a.rmsDb < QC.silentRmsDb) issues.push({ code: "silent", atMs: 0, spanMs: stats.durationMs, ours: true, gate: "block", message: "the export has no sound" });
  } else if (expect.hasSpeech) {
    issues.push({ code: "silent", atMs: 0, spanMs: stats.durationMs, ours: true, gate: "block", message: "the export has no sound" });
  }
  return issues;
}

export interface QcVerdict {
  /** deliver it */
  ok: boolean;
  /** not delivered, whatever the person says */
  blocking: QcIssue[];
  /** shown, with "export anyway" */
  overridable: QcIssue[];
}

/** The gate. `accepted` is the person saying "export anyway" to what is theirs to accept. */
export function qcVerdict(issues: QcIssue[], accepted = false): QcVerdict {
  const blocking = issues.filter((i) => i.gate === "block");
  const overridable = issues.filter((i) => i.gate === "ask");
  return { ok: !blocking.length && (accepted || !overridable.length), blocking, overridable };
}
