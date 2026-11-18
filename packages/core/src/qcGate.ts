import { breath } from "./autocut";
import { captionFixCentre, outputFaceCy } from "./captions";
import type { EditDoc } from "./editModel";
import type { RenderMeasure } from "./jobs";
import { applyChange, type Change, type EditOp } from "./ops";
import { QC, qcDoc, qcMedia, qcVerdict, type MediaStats, type QcIssue, type QcVerdict } from "./qc";
import { sourceAt, toTimeline, type Segment } from "./timeline";

/**
 * The export gate around qc.ts (docs/goal-plan-build.md §4): the safe automatic fixes made before anything is
 * rendered, the worker's ffmpeg numbers turned into the measures qc.ts reads, and one call that decides an export.
 * The device render and the worker render both end here, so the two paths can't disagree.
 */

export const QC_ACTOR = "autopilot:qc" as const;
const clean = (t: string) => t.replace(/[^\p{L}\p{N}'’-]/gu, "");

/** Pieces of the edit that play straight through (beads tile the take, so only a jump in source time is a cut). */
function playedPieces(doc: EditDoc): Segment[] {
  const out: Segment[] = [];
  for (const p of toTimeline(doc).segments) {
    const last = out.at(-1);
    if (last && last.clipId === p.clipId && Math.abs(last.toMs - p.fromMs) <= 1) out[out.length - 1] = { ...last, toMs: p.toMs };
    else out.push(p);
  }
  return out;
}

/**
 * Move one cut edge that lands inside a kept word out to the word's edge plus the breath autocut keeps (#49), always
 * in the direction that keeps the word whole: a cut never takes more of what was said, only less. Only edges the doc
 * stores are moved (a silence cut's start or end, a bead's in or out with its neighbour); anything else is left to the
 * gate. Returns null when there is nothing safe to do.
 */
function snapEdge(doc: EditDoc, clipId: string, src: number, side: "start" | "end", w: { startMs: number; endMs: number; text: string }): Change | null {
  const at = (ms: number) => Math.abs(ms - src) <= 1;
  const all = doc.beads.filter((b) => b.clipId === clipId).flatMap((b) => b.words).sort((a, b) => a.startMs - b.startMs);
  const next = all.find((x) => x.startMs >= w.endMs);
  const prev = [...all].reverse().find((x) => x.endMs <= w.startMs);
  const tail = breath(next ? next.startMs - w.endMs : 1000).tail;
  const lead = breath(prev ? w.startMs - prev.endMs : 1000).lead;
  const reason = `cut moved to a word boundary · keeps '${clean(w.text)}' whole`;
  const ops: EditOp[] = [];
  const beads = doc.beads.filter((b) => b.clipId === clipId);
  for (const b of beads) {
    if (b.struck) continue;
    const base = `/beads/@${b.id}`;
    for (const c of b.cuts) {
      if (!c.struck) continue;
      if (side === "end" && at(c.startMs)) {
        // the cut starts inside the word: start it after the word (and its breath) instead
        const to = w.endMs + tail;
        ops.push(to >= c.endMs - 1 ? { op: "set", path: `${base}/cuts/@${c.id}/struck`, value: false } : { op: "set", path: `${base}/cuts/@${c.id}/startMs`, value: to });
      } else if (side === "start" && at(c.endMs)) {
        const to = w.startMs - lead;
        ops.push(to <= c.startMs + 1 ? { op: "set", path: `${base}/cuts/@${c.id}/struck`, value: false } : { op: "set", path: `${base}/cuts/@${c.id}/endMs`, value: to });
      }
    }
    if (ops.length) return { actor: QC_ACTOR, reason, ops: ops.slice(0, 1) };
    const clip = doc.clips.find((c) => c.id === clipId);
    if (side === "end" && at(b.outMs)) {
      const nb = beads.find((x) => x !== b && Math.abs(x.inMs - b.outMs) <= 1);
      const to = Math.min(w.endMs + tail, nb ? nb.outMs - 1 : clip?.durationMs ?? w.endMs + tail);
      if (to <= b.outMs) return null;
      ops.push({ op: "set", path: `${base}/outMs`, value: to });
      if (nb) ops.push({ op: "set", path: `/beads/@${nb.id}/inMs`, value: to });
      return { actor: QC_ACTOR, reason, ops };
    }
    if (side === "start" && at(b.inMs)) {
      const pb = beads.find((x) => x !== b && Math.abs(x.outMs - b.inMs) <= 1);
      const to = Math.max(w.startMs - lead, pb ? pb.inMs + 1 : 0);
      if (to >= b.inMs) return null;
      ops.push({ op: "set", path: `${base}/inMs`, value: to });
      if (pb) ops.push({ op: "set", path: `/beads/@${pb.id}/outMs`, value: to });
      return { actor: QC_ACTOR, reason, ops };
    }
  }
  return null;
}

/**
 * The fixes that are cheap and can't change what anyone said: cuts inside a word move to the word's edge, and
 * captions that would cover the face or leave the safe area move into the safe band. Each is an explained
 * autopilot change, so anything the person touched (pinned) is left alone and stays theirs to decide.
 */
export function qcFixes(doc: EditDoc): Change[] {
  const changes: Change[] = [];
  const kept = new Map<string, { startMs: number; endMs: number; text: string }[]>();
  for (const b of doc.beads) {
    if (b.struck) continue;
    kept.set(b.clipId, [...(kept.get(b.clipId) ?? []), ...b.words.filter((w) => !w.struck)]);
  }
  const tol = QC.wordEdgeToleranceMs;
  const pieces = playedPieces(doc);
  pieces.forEach((s, i) => {
    const edges: [number, "start" | "end"][] = [];
    if (i > 0) edges.push([s.fromMs, "start"]);
    if (i < pieces.length - 1) edges.push([s.toMs, "end"]);
    for (const [src, side] of edges) {
      const w = (kept.get(s.clipId) ?? []).find((w) => src > w.startMs + tol && src < w.endMs - tol);
      const fix = w && snapEdge(doc, s.clipId, src, side, w);
      if (fix) changes.push(fix);
    }
  });
  const band = qcDoc(doc).find((x) => x.code === "caption_band" && x.ours);
  if (band) {
    const c = captionFixCentre(doc.aspect, outputFaceCy(doc, doc.aspect));
    const why = band.message.includes("face") ? "off the face" : "inside the safe area";
    const op: EditOp = doc.captions.place ? { op: "set", path: `/captions/place/${doc.aspect}`, value: c } : { op: "set", path: "/captions/place", value: { [doc.aspect]: c } };
    changes.push({ actor: QC_ACTOR, reason: `captions moved into the safe band · ${why}`, ops: [op] });
  }
  return changes;
}

/**
 * Fix what's fixable, then check again once (goal-plan-build §4). `changes` are the ones that applied, to be committed
 * to the edit as they are; `issues` is what is left.
 */
export function qcAutoFix(doc: EditDoc): { doc: EditDoc; changes: Change[]; issues: QcIssue[] } {
  const before = qcDoc(doc);
  if (!before.some((i) => i.ours && (i.code === "mid_word_cut" || i.code === "caption_band"))) return { doc, changes: [], issues: before };
  let next = doc;
  const changes: Change[] = [];
  for (const c of qcFixes(doc)) {
    const r = applyChange(next, c);
    if (!r) continue; // all of it pinned: the person's call
    next = r.doc;
    changes.push(c);
  }
  return { doc: next, changes, issues: qcDoc(next) };
}

/**
 * The worker's ffmpeg stretches → the per-sample measures qc.ts reads, at `step` ms (fine, so the thresholds in qc.ts
 * decide, not the sampling). The takes' stretches are mapped onto the export's timeline through the edit; a moment
 * whose take wasn't measured counts as moving and bright, which is the strict reading.
 */
export function statsFromMeasure(m: RenderMeasure, doc: EditDoc, step = 50): MediaStats {
  const n = Math.max(1, Math.ceil(m.durationMs / step));
  const inSpan = (spans: { startMs: number; endMs: number }[], t: number) => spans.some((s) => t >= s.startMs && t < s.endMs);
  const mids = Array.from({ length: n }, (_, i) => i * step + step / 2);
  const stats: MediaStats = {
    durationMs: m.durationMs,
    sampleEveryMs: step,
    luma: mids.map((t) => (inSpan(m.black, t) ? 0 : 0.5)),
    diff: mids.map((t, i) => (i === 0 || inSpan(m.frozen, t) ? 0 : 1)),
  };
  if (m.sources) {
    const segs = toTimeline(doc).segments;
    const src = mids.map((t) => {
      const at = sourceAt(segs, t);
      return at ? { s: m.sources![at.clipId], ms: at.srcMs } : null;
    });
    stats.sourceLuma = src.map((x) => (x?.s && inSpan(x.s.black, x.ms) ? 0 : 0.5));
    stats.sourceDiff = src.map((x, i) => (i === 0 || (x?.s && inSpan(x.s.frozen, x.ms)) ? 0 : 1));
  }
  if (m.audio) {
    const peaks = Object.values(m.sources ?? {}).flatMap((s) => (s.audio ? [s.audio.peakDb] : []));
    stats.audio = { ...m.audio, ...(peaks.length ? { sourcePeakDb: Math.max(...peaks) } : {}) };
  }
  return stats;
}

/** Does this edit have anything said in it (an export of it should have sound)? */
export function hasSpeech(doc: EditDoc): boolean {
  return doc.beads.some((b) => !b.struck && b.words.some((w) => !w.struck));
}

export interface QcResult {
  /** false when no measurements came back (an older worker): delivered, and marked unchecked */
  checked: boolean;
  issues: QcIssue[];
  verdict: QcVerdict;
  /** the one line the export pill shows: the first blocking issue, else the first to ask about */
  headline?: QcIssue;
}

/** Decide an export: the edit's own problems plus what was measured on the file. */
export function qcExport(doc: EditDoc, stats: MediaStats | undefined, accepted = false): QcResult {
  const tl = toTimeline(doc);
  const issues = [...qcDoc(doc), ...(stats ? qcMedia(stats, { durationMs: tl.durationMs, hasSpeech: hasSpeech(doc) }) : [])];
  const verdict = qcVerdict(issues, accepted);
  return { checked: !!stats, issues, verdict, headline: verdict.blocking[0] ?? verdict.overridable[0] };
}

/**
 * The way out the export pill offers for an issue, only where a real one exists: "again" renders it again (a broken
 * file is a render fault), "show" puts the playhead on the spot so the person can change it there.
 */
export function qcAction(issue: QcIssue): "again" | "show" | null {
  switch (issue.code) {
    case "black_frames":
    case "frozen_frames":
    case "wrong_length":
    case "silent":
      return "again";
    case "clipping":
      return issue.ours ? "again" : null;
    case "mid_word_cut":
    case "caption_overlap":
    case "caption_band":
    case "flash_segment":
      return "show";
    default:
      return null;
  }
}
