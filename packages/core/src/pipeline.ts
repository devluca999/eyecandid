import type { Change, EditOp } from "./ops";
import type { Bead, Clip, EditDoc, Moment, ReframeKeyframe, Word } from "./editModel";
import type { JobOutput } from "./jobs";

/**
 * Engine outputs → explained changes to the edit model. Pure: same inputs, same changes.
 * Every change carries a one-line `action · reason` so the UI can explain it on hover.
 */

type Transcript = JobOutput<"transcribe">;
type Autocut = JobOutput<"autocut">;

export function addClipChange(clip: Clip): Change {
  return {
    actor: "autopilot:import",
    reason: `added clip · ${(clip.durationMs / 1000).toFixed(1)}s ${clip.source === "generated" ? "generated" : "footage"}`,
    ops: [{ op: "insert", path: "/clips/-", value: clip }],
  };
}

const overlaps = (aS: number, aE: number, bS: number, bE: number) => aS < bE && bS < aE;
/** shorter than this is a sub-frame sliver, not a pause worth a cut */
const MIN_CUT_MS = 40;

/**
 * Build beads for one clip from its transcript and the autocut result, as a sequence of changes:
 * one to split into beads, one per strike (each restorable, each with its own reason), one per moment.
 */
export function beadChanges(doc: EditDoc, clipId: string, transcript: Transcript, cut: Autocut): Change[] {
  const words: Word[] = transcript.words.map((w, i) => ({
    id: `${clipId}.w${i}`,
    text: w.text,
    startMs: w.startMs,
    endMs: w.endMs,
    conf: w.conf,
    struck: false,
  }));
  const beads: Bead[] = cut.beads.map((b, i) => ({
    id: `${clipId}.b${i}`,
    clipId,
    inMs: b.inMs,
    outMs: b.outMs,
    words: words.filter((w) => w.startMs >= b.inMs && w.endMs <= b.outMs),
    cuts: [],
    struck: false,
  }));
  if (beads.length === 0) return [];
  // beads tile the spoken span: the gap after a sentence belongs to its bead, so a pause between sentences is
  // either kept or struck as a restorable cut with a reason, never dropped silently
  for (let i = 0; i < beads.length - 1; i++) beads[i]!.outMs = Math.max(beads[i]!.outMs, beads[i + 1]!.inMs);

  // keep other clips' beads; replace this clip's
  const others = doc.beads.filter((b) => b.clipId !== clipId);
  const changes: Change[] = [
    {
      actor: "autopilot:autocut",
      reason: `split into ${beads.length} beads · at sentences`,
      ops: [{ op: "set", path: "/beads", value: [...others, ...beads] }],
    },
  ];

  // strikes: fillers/repeats strike words; silences become cut ranges inside the bead
  let cutN = 0;
  const pauseCut = (startMs: number, endMs: number): EditOp | null => {
    const bead = beads.find((b) => overlaps(startMs, endMs, b.inMs, b.outMs));
    if (!bead) return null;
    const c = { id: `${clipId}.c${cutN++}`, startMs: Math.max(startMs, bead.inMs), endMs: Math.min(endMs, bead.outMs), kind: "silence" as const, struck: true };
    return { op: "insert", path: `/beads/@${bead.id}/cuts/-`, value: c };
  };
  for (const s of cut.strikes) {
    if (s.kind === "silence") {
      const op = pauseCut(s.startMs, s.endMs);
      if (op) changes.push({ actor: "autopilot:autocut", reason: s.reason, ops: [op] });
      continue;
    }
    // a strike may reach across a bead edge (a retake and the pause after it), so look in every bead it touches
    const hit = beads
      .filter((b) => overlaps(s.startMs, s.endMs, b.inMs, b.outMs))
      .flatMap((bead) => bead.words.filter((w) => w.startMs >= s.startMs && w.endMs <= s.endMs).map((w) => ({ bead, w })));
    if (!hit.length) continue;
    const ops: EditOp[] = hit.flatMap(({ bead, w }) => [
      { op: "set" as const, path: `/beads/@${bead.id}/words/@${w.id}/struck`, value: true },
      { op: "set" as const, path: `/beads/@${bead.id}/words/@${w.id}/strikeKind`, value: s.kind },
    ]);
    // the pause the strike swallowed around its words becomes restorable pause cuts in the same change (one reason).
    // A gap between two struck words of one bead needs no cut: the timeline drops it with them.
    let cursor = s.startMs;
    let prevBead: Bead | undefined;
    for (const { bead, w } of hit) {
      if (w.startMs - cursor >= MIN_CUT_MS && prevBead !== bead) {
        const op = pauseCut(cursor, w.startMs);
        if (op) ops.push(op);
      }
      cursor = Math.max(cursor, w.endMs);
      prevBead = bead;
    }
    if (s.endMs - cursor >= MIN_CUT_MS) {
      const op = pauseCut(cursor, s.endMs);
      if (op) ops.push(op);
    }
    changes.push({ actor: "autopilot:autocut", reason: s.reason, ops });
  }

  // moments: hook and CTA come from autocut; best line is the clearest full sentence in between
  for (const [i, b] of cut.beads.entries()) {
    if (b.moment) changes.push(momentChange(beads[i]!, b.moment));
  }
  // …among lines still said: a take autocut struck whole is never the best line (hook and CTA skip it too)
  const said = beads.filter((b) => !b.words.every((w) => cut.strikes.some((s) => s.kind !== "silence" && w.startMs >= s.startMs && w.endMs <= s.endMs)));
  const best = bestLine(said);
  if (best && !best.moment && !cut.beads.some((b) => b.moment === "best")) changes.push(momentChange(best, "best"));
  return changes;
}

const MOMENT_REASON: Record<Moment, string> = {
  hook: "hook · your opening line",
  best: "best line · clearest delivery",
  cta: "call to action · your closing line",
};
function momentChange(bead: Bead, m: Moment): Change {
  return { actor: "autopilot:moments", reason: MOMENT_REASON[m], ops: [{ op: "set", path: `/beads/@${bead.id}/moment`, value: m }] };
}

/** Heuristic, stated honestly in the reason: highest mean word confidence among middle beads with 4+ words. */
export function bestLine(beads: Bead[]): Bead | undefined {
  const middle = beads.slice(1, -1).filter((b) => b.words.length >= 4);
  let best: Bead | undefined;
  let score = -1;
  for (const b of middle) {
    const s = b.words.reduce((a, w) => a + w.conf, 0) / b.words.length;
    if (s > score) [best, score] = [b, s];
  }
  return best;
}

export function reframeChange(clipId: string, keyframes: ReframeKeyframe[], faces: number): Change {
  return {
    actor: "autopilot:reframe",
    reason: faces > 0 ? "reframed · keeps your face centred" : "reframed · centred, no face found",
    ops: [{ op: "set", path: `/reframe/${clipId}`, value: keyframes }],
  };
}

/** Kept duration of a bead after struck words and silences. */
export function keptMs(b: Bead): number {
  if (b.struck) return 0;
  const gone = [
    ...b.words.filter((w) => w.struck).map((w) => w.endMs - w.startMs),
    ...b.cuts.filter((c) => c.struck).map((c) => c.endMs - c.startMs),
  ].reduce((a, x) => a + x, 0);
  return Math.max(0, b.outMs - b.inMs - gone);
}

/**
 * Cutdown to fit maxMs (15/30/60s): keep the hook and CTA, then moments, then beads in order,
 * striking the rest. Pinned beads are never struck. Returns null if it already fits.
 */
export function cutdownChange(doc: EditDoc, maxMs: number): Change | null {
  const live = doc.beads.filter((b) => !b.struck);
  const total = live.reduce((a, b) => a + keptMs(b), 0);
  if (total <= maxMs) return null;
  const rank = (b: Bead) => (b.moment === "hook" ? 0 : b.moment === "cta" ? 1 : b.moment === "best" ? 2 : 3);
  const order = [...live].sort((a, b) => rank(a) - rank(b) || live.indexOf(a) - live.indexOf(b));
  const keep = new Set<string>();
  let used = 0;
  for (const b of order) {
    const pinned = doc.pins.some((p) => p === `/beads/@${b.id}/struck` || p === `/beads/@${b.id}`);
    if (pinned || used + keptMs(b) <= maxMs) {
      keep.add(b.id);
      used += keptMs(b);
    }
  }
  const ops: EditOp[] = live.filter((b) => !keep.has(b.id)).map((b) => ({ op: "set", path: `/beads/@${b.id}/struck`, value: true }));
  if (!ops.length) return null;
  return { actor: "autopilot:cutdown", reason: `cutdown · ${Math.round(maxMs / 1000)}s, kept hook and call to action`, ops };
}

/**
 * Captions keep the speaker's words: an inline edit may fix spelling, casing or punctuation, not swap the word.
 * Allowed if the letters are within a small edit distance of the original.
 */
export function isSpellingFix(from: string, to: string): boolean {
  const norm = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");
  const a = norm(from);
  const b = norm(to);
  if (a === b) return true;
  if (!a || !b) return false;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)] as number[]);
  for (let j = 1; j <= b.length; j++) d[0]![j] = j;
  for (let i = 1; i <= a.length; i++)
    for (let j = 1; j <= b.length; j++)
      d[i]![j] = Math.min(d[i - 1]![j]! + 1, d[i]![j - 1]! + 1, d[i - 1]![j - 1]! + (a[i - 1] === b[j - 1] ? 0 : 1));
  return d[a.length]![b.length]! <= Math.max(1, Math.floor(Math.max(a.length, b.length) * 0.34));
}

const tokens = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}' ]/gu, " ").split(/\s+/).filter(Boolean);

/** How much of a script line a bead says (0..1): share of the line's words present in the bead, in any order. */
export function lineMatch(line: string, bead: Bead): number {
  const want = tokens(line);
  if (!want.length) return 0;
  const have = new Set(bead.words.filter((w) => !w.struck).flatMap((w) => tokens(w.text)));
  return want.filter((t) => have.has(t)).length / want.length;
}

/**
 * Teleprompter retakes on one continuous recording: when a script line was said more than once, keep the last take
 * and strike the earlier ones (restorable, with a reason). Beads that match no line are left alone.
 */
export function retakeChanges(doc: EditDoc, threshold = 0.6): Change[] {
  if (!doc.script.length) return [];
  const byLine = new Map<number, Bead[]>();
  for (const b of doc.beads) {
    if (b.struck) continue;
    let best = -1;
    let score = threshold;
    doc.script.forEach((line, i) => {
      const m = lineMatch(line, b);
      if (m >= score) [best, score] = [i, m];
    });
    if (best >= 0) byLine.set(best, [...(byLine.get(best) ?? []), b]);
  }
  const changes: Change[] = [];
  for (const [line, beads] of [...byLine.entries()].sort((a, b) => a[0] - b[0])) {
    const earlier = beads.slice(0, -1);
    if (!earlier.length) continue;
    changes.push({
      actor: "autopilot:retakes",
      reason: `retake · kept your last take of line ${line + 1}`,
      ops: earlier.map((b) => ({ op: "set" as const, path: `/beads/@${b.id}/struck`, value: true })),
    });
  }
  return changes;
}
