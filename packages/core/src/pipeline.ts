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
  for (const s of cut.strikes) {
    const bead = beads.find((b) => overlaps(s.startMs, s.endMs, b.inMs, b.outMs));
    if (!bead) continue;
    if (s.kind === "silence") {
      const c = { id: `${clipId}.c${cutN++}`, startMs: s.startMs, endMs: s.endMs, kind: "silence" as const, struck: true };
      changes.push({ actor: "autopilot:autocut", reason: s.reason, ops: [{ op: "insert", path: `/beads/@${bead.id}/cuts/-`, value: c }] });
    } else {
      const ops: EditOp[] = bead.words
        .filter((w) => w.startMs >= s.startMs && w.endMs <= s.endMs)
        .flatMap((w) => [
          { op: "set" as const, path: `/beads/@${bead.id}/words/@${w.id}/struck`, value: true },
          { op: "set" as const, path: `/beads/@${bead.id}/words/@${w.id}/strikeKind`, value: s.kind },
        ]);
      if (ops.length) changes.push({ actor: "autopilot:autocut", reason: s.reason, ops });
    }
  }

  // moments: hook and CTA come from autocut; best line is the clearest full sentence in between
  for (const [i, b] of cut.beads.entries()) {
    if (b.moment) changes.push(momentChange(beads[i]!, b.moment));
  }
  const best = bestLine(beads);
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
