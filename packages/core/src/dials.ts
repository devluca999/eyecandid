import type { Bead, Cut, EditDoc, Effect, Moment } from "./editModel";
import { isPinned, type Change, type EditOp } from "./ops";

/**
 * The dials (pace, b-roll density, energy) re-edit the whole cut. Pure: `dialChanges(doc, dials)` returns the
 * changes that bring the doc to what the dials ask for, one explained change per decision, each reversible,
 * never touching a path the user pinned. Idempotent: run it on its own result and it returns nothing.
 *
 * - pace: how long a pause may last. Pauses (gaps between words) at least `pauseLimitMs(pace)` long are cut;
 *   shorter ones are kept. Existing silence cuts are struck / restored; a pause autocut left alone gets a new,
 *   dial-owned cut (removed again when the dial comes back). Pace 0.5 matches autocut's own 450ms line, so a
 *   fresh edit is already where the dial says it is.
 * - energy: punch-ins (a 1.04–1.12 push-in on the face) on your hook and best line, then the call to action,
 *   then every other bead. At 0.5 and below the cut is as shot.
 * - b-roll density: stored in style only. There is no b-roll until Weave (Phase 3), so it decides nothing.
 */
export type DialValues = { pace: number; brollDensity: number; energy: number };

export const DIALS_ACTOR = "autopilot:dials" as const;
/** autocut's default pause line (jobs.ts autocut.minSilenceMs); pace 0.5 lands exactly here */
export const AUTOCUT_PAUSE_MS = 450;
/** breath left on each side of a pause the pace dial cuts */
export const PACE_HANDLE_MS = 80;
/** effect ids the energy dial owns */
export const PUNCH_PREFIX = "pi_";

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
const secs = (ms: number) => (ms / 1000).toFixed(1);

/** Longest pause pace keeps: 1200ms (slow) → 450ms (0.5, autocut's line) → 250ms (fast). */
export function pauseLimitMs(pace: number): number {
  const p = clamp01(pace);
  return Math.round(p <= 0.5 ? 1200 - (p / 0.5) * (1200 - AUTOCUT_PAUSE_MS) : AUTOCUT_PAUSE_MS - ((p - 0.5) / 0.5) * (AUTOCUT_PAUSE_MS - 250));
}

/** Punch-in scale for an energy value, or null when the cut stays as shot. */
export function punchScale(energy: number): number | null {
  const e = clamp01(energy);
  if (e <= 0.5) return null;
  return Math.round((1.04 + ((e - 0.5) / 0.5) * 0.08) * 100) / 100;
}

/** The b-roll dial's honest line until Weave exists. */
export const BROLL_NOTE = "no b-roll yet · add clips to weave";

const MOMENT_WHY: Record<Moment, string> = { hook: "your hook", best: "your best line", cta: "your call to action" };

/** A path is off limits if it, a parent or a child of it is pinned. */
function touchesPin(pins: readonly string[], path: string) {
  return isPinned(pins, path) || pins.some((p) => p.startsWith(path + "/"));
}

type Gap = { startMs: number; endMs: number };

/** Pauses between consecutive words of one clip (across bead edges: beads tile the spoken span). */
function gapsOf(beads: Bead[]): Gap[] {
  const words = beads.flatMap((b) => b.words).sort((a, b) => a.startMs - b.startMs);
  const out: Gap[] = [];
  for (let i = 1; i < words.length; i++) {
    const a = words[i - 1]!;
    const b = words[i]!;
    if (b.startMs > a.endMs) out.push({ startMs: a.endMs, endMs: b.startMs });
  }
  return out;
}

const overlaps = (c: { startMs: number; endMs: number }, g: Gap) => c.startMs < g.endMs && g.startMs < c.endMs;

function paceChanges(doc: EditDoc, pace: number): Change[] {
  const limit = pauseLimitMs(pace);
  const changes: Change[] = [];
  const byClip = new Map<string, Bead[]>();
  for (const b of doc.beads) byClip.set(b.clipId, [...(byClip.get(b.clipId) ?? []), b]);

  for (const beads of byClip.values()) {
    const cuts: { bead: Bead; cut: Cut }[] = beads.flatMap((bead) => bead.cuts.map((cut) => ({ bead, cut })));
    for (const gap of gapsOf(beads)) {
      const len = gap.endMs - gap.startMs;
      const want = len >= limit;
      const found = cuts.find((x) => overlaps(x.cut, gap));
      if (found) {
        const { bead, cut } = found;
        const path = `/beads/@${bead.id}/cuts/@${cut.id}`;
        const ours = cut.id.startsWith(`${bead.id}.p`);
        if (ours && !want) {
          // a pause only the dial cut: take the cut away again, so turning back restores the doc exactly
          if (!touchesPin(doc.pins, path)) changes.push({ actor: DIALS_ACTOR, reason: `pause kept · ${secs(len)}s · pace`, ops: [{ op: "remove", path }] });
          continue;
        }
        if (cut.struck !== want && !touchesPin(doc.pins, `${path}/struck`)) {
          changes.push({ actor: DIALS_ACTOR, reason: `pause ${want ? "cut" : "kept"} · ${secs(len)}s · pace`, ops: [{ op: "set", path: `${path}/struck`, value: want }] });
        }
        continue;
      }
      if (!want) continue;
      const mid = (gap.startMs + gap.endMs) / 2;
      const bead = beads.find((b) => mid >= b.inMs && mid < b.outMs);
      if (!bead) continue;
      const startMs = Math.max(bead.inMs, gap.startMs + PACE_HANDLE_MS);
      const endMs = Math.min(bead.outMs, gap.endMs - PACE_HANDLE_MS);
      if (endMs - startMs < 40) continue;
      const id = `${bead.id}.p${gap.startMs}`;
      if (touchesPin(doc.pins, `/beads/@${bead.id}/cuts/@${id}`)) continue;
      const cut: Cut = { id, startMs, endMs, kind: "silence", struck: true };
      changes.push({ actor: DIALS_ACTOR, reason: `pause cut · ${secs(len)}s · pace`, ops: [{ op: "insert", path: `/beads/@${bead.id}/cuts/-`, value: cut }] });
    }
  }
  return changes;
}

type Punch = { id: string; effect: Effect; why: string };

/** Which beads get a punch-in at this energy, most important first. */
function wantedPunches(doc: EditDoc, energy: number): Punch[] {
  const scale = punchScale(energy);
  if (scale === null) return [];
  const e = clamp01(energy);
  const live = doc.beads.filter((b) => !b.struck && b.words.length > 0);
  const moments: Moment[] = e > 0.7 ? ["hook", "best", "cta"] : ["hook", "best"];
  const out: Punch[] = [];
  for (const m of moments) {
    const b = live.find((x) => x.moment === m);
    if (b) out.push({ id: PUNCH_PREFIX + b.id, why: MOMENT_WHY[m], effect: { id: PUNCH_PREFIX + b.id, kind: "punch_in", anchor: { moment: m }, params: { scale } } });
  }
  if (e > 0.85) {
    // high energy: every other remaining bead too, so the push-ins alternate with the wide shot
    live.filter((b) => !b.moment).forEach((b, i) => {
      if (i % 2 === 1) return;
      out.push({ id: PUNCH_PREFIX + b.id, why: "energy", effect: { id: PUNCH_PREFIX + b.id, kind: "punch_in", anchor: { wordId: b.words[0]!.id }, params: { scale } } });
    });
  }
  return out;
}

function energyChanges(doc: EditDoc, energy: number): Change[] {
  const want = wantedPunches(doc, energy);
  const wantIds = new Set(want.map((p) => p.id));
  const have = doc.effects.filter((f) => f.kind === "punch_in" && f.id.startsWith(PUNCH_PREFIX));
  const changes: Change[] = [];
  for (const f of have) {
    if (wantIds.has(f.id)) continue;
    const path = `/effects/@${f.id}`;
    if (!touchesPin(doc.pins, path)) changes.push({ actor: DIALS_ACTOR, reason: "punch-in removed · energy", ops: [{ op: "remove", path }] });
  }
  for (const p of want) {
    const cur = have.find((f) => f.id === p.id);
    const path = `/effects/@${p.id}`;
    if (touchesPin(doc.pins, path)) continue;
    if (!cur) {
      changes.push({ actor: DIALS_ACTOR, reason: `punch-in · ${p.why}`, ops: [{ op: "insert", path: "/effects/-", value: p.effect }] });
    } else if (cur.params.scale !== p.effect.params.scale || JSON.stringify(cur.anchor) !== JSON.stringify(p.effect.anchor)) {
      changes.push({ actor: DIALS_ACTOR, reason: `punch-in · ${p.why} · ${String(p.effect.params.scale)}×`, ops: [{ op: "set", path, value: p.effect } satisfies EditOp] });
    }
  }
  return changes;
}

/** Everything the dials ask for that the doc doesn't already have. */
export function dialChanges(doc: EditDoc, dials: DialValues): Change[] {
  return [...paceChanges(doc, dials.pace), ...energyChanges(doc, dials.energy)];
}

/** Punch-in scale for a bead (1 = as shot): the strongest punch-in anchored to it. */
export function punchForBead(doc: EditDoc, bead: Bead): number {
  let s = 1;
  for (const f of doc.effects) {
    if (f.kind !== "punch_in") continue;
    const a = f.anchor as { moment?: Moment; wordId?: string; ms?: number };
    const hit =
      (a.moment !== undefined && bead.moment === a.moment) ||
      (a.wordId !== undefined && bead.words.some((w) => w.id === a.wordId)) ||
      (a.ms !== undefined && a.ms >= bead.inMs && a.ms < bead.outMs);
    const v = Number(f.params.scale);
    if (hit && Number.isFinite(v) && v > s) s = v;
  }
  return Math.min(1.5, s);
}

/** Punch-in scale at a source position of a clip — what the preview and the renderer both apply. */
export function punchAt(doc: EditDoc, clipId: string, srcMs: number): number {
  const bead = doc.beads.find((b) => b.clipId === clipId && !b.struck && srcMs >= b.inMs && srcMs < b.outMs);
  return bead ? punchForBead(doc, bead) : 1;
}
