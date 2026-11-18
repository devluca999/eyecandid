import type { Aspect, Bead, EditDoc, TrackItem } from "./editModel";
import type { Change } from "./ops";
import { isPinned } from "./ops";
import { toTimeline, type Segment } from "./timeline";

/**
 * Generated b-roll stills (Phase 4, ADR 0013). One b-roll slot per bead on the `broll` track: a TrackItem whose `ref`
 * is the still's mediaId and whose `params.beadId` anchors it to the bead. The span on the output timeline is derived
 * from the bead's kept segments every time (brollOverlays), never stored, so striking a word moves the still with it.
 */

/** Track item id for a bead's b-roll slot. */
export const brollItemId = (beadId: string) => `broll.${beadId}`;
export const brollPath = (beadId: string) => `/tracks/broll/@${brollItemId(beadId)}`;

/** Still sizes per output aspect: multiples of 16, about one megapixel, what the model renders well and fast. */
export const STILL_SIZE: Record<Aspect, { w: number; h: number }> = {
  "9:16": { w: 720, h: 1280 },
  "4:5": { w: 896, h: 1120 },
  "1:1": { w: 1024, h: 1024 },
  "16:9": { w: 1280, h: 720 },
};

/** The bead's kept words as spoken (caption spelling fixes applied), no struck fillers. */
export function beadText(doc: EditDoc, bead: Bead): string {
  const overrides = new Map(doc.captions.overrides.map((o) => [o.wordId, o.text]));
  return bead.words
    .filter((w) => !w.struck)
    .map((w) => overrides.get(w.id) ?? w.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

export const MAX_STILL_PROMPT = 400;

/**
 * A prompt from the bead's own words: a fixed template, no LLM. The words are quoted as they were said; the template
 * only asks for a photographic cutaway with no lettering (text in generated images is the usual tell).
 */
export function stillPrompt(doc: EditDoc, bead: Bead): string {
  const said = beadText(doc, bead).split(" ").slice(0, 40).join(" ").replace(/["“”]/g, "'");
  if (!said) return "";
  return `cinematic b-roll photograph for a short video, illustrating: "${said}". natural light, shallow depth of field, real-world scene, no text, no captions, no logos`.slice(0, MAX_STILL_PROMPT);
}

/** First few kept words, for the change's one-line reason. */
export function firstWords(doc: EditDoc, bead: Bead, n = 4): string {
  const words = beadText(doc, bead).split(" ").filter(Boolean);
  return words.slice(0, n).join(" ") + (words.length > n ? "…" : "");
}

/** Is the bead's b-roll slot (or the whole b-roll track) the user's decision? Then autopilot leaves it alone. */
export function brollSlotPinned(pins: readonly string[], beadId: string): boolean {
  const path = brollPath(beadId);
  return isPinned(pins, path) || isPinned(pins, "/tracks/broll") || pins.some((p) => p.startsWith(path + "/"));
}

/**
 * The explained change that places a generated still as b-roll over a bead: inserts the bead's slot, or replaces
 * the still in it. Null when the bead is gone or its slot is pinned (the user's decision wins).
 */
export function brollStillChange(doc: EditDoc, a: { beadId: string; mediaId: string; w: number; h: number; jobId?: string }): Change | null {
  const bead = doc.beads.find((b) => b.id === a.beadId);
  if (!bead) return null;
  if (brollSlotPinned(doc.pins, a.beadId)) return null;
  const item: TrackItem = {
    id: brollItemId(a.beadId),
    ref: a.mediaId,
    // the bead's source span, for reference only; the renderers derive the output span from the bead (brollOverlays)
    startMs: bead.inMs,
    durationMs: Math.max(0, bead.outMs - bead.inMs),
    params: { beadId: a.beadId, kind: "still", w: a.w, h: a.h, ...(a.jobId ? { jobId: a.jobId } : {}) },
  };
  const exists = doc.tracks.broll.some((t) => t.id === item.id);
  const reason = `b-roll · generated still for '${firstWords(doc, bead)}'`;
  return {
    actor: "autopilot:broll",
    reason: reason.length > 120 ? reason.slice(0, 118) + "…'" : reason,
    ops: exists ? [{ op: "set", path: brollPath(a.beadId), value: item }] : [{ op: "insert", path: "/tracks/broll/-", value: item }],
  };
}

export type BrollOverlay = { id: string; beadId: string; mediaId: string; startMs: number; endMs: number; w?: number; h?: number };

/**
 * Where each bead-anchored b-roll item shows on the output timeline: from the first kept moment of its bead to the
 * last. A struck bead (or one with nothing kept) shows no b-roll. Shared by the Lens preview, CutWeb and Cut.
 */
export function brollOverlays(doc: EditDoc, segments: Segment[] = toTimeline(doc).segments): BrollOverlay[] {
  const spans = new Map<string, { startMs: number; endMs: number }>();
  let at = 0;
  for (const s of segments) {
    const len = s.toMs - s.fromMs;
    if (s.beadId) {
      const cur = spans.get(s.beadId);
      if (cur) cur.endMs = at + len;
      else spans.set(s.beadId, { startMs: at, endMs: at + len });
    }
    at += len;
  }
  const out: BrollOverlay[] = [];
  for (const t of doc.tracks.broll) {
    const beadId = typeof t.params.beadId === "string" ? t.params.beadId : undefined;
    const span = beadId ? spans.get(beadId) : undefined;
    if (!beadId || !span || span.endMs - span.startMs <= 0) continue;
    const w = typeof t.params.w === "number" ? t.params.w : undefined;
    const h = typeof t.params.h === "number" ? t.params.h : undefined;
    out.push({ id: t.id, beadId, mediaId: t.ref, ...span, w, h });
  }
  return out.sort((x, y) => x.startMs - y.startMs);
}

/** Ken Burns: a slow push from 1.0 to 1.08 across the overlay, and a short fade at each end (t in ms on the output). */
export function kenBurnsAt(o: Pick<BrollOverlay, "startMs" | "endMs">, outMs: number): { scale: number; opacity: number } {
  const len = Math.max(1, o.endMs - o.startMs);
  const p = Math.min(1, Math.max(0, (outMs - o.startMs) / len));
  const fade = Math.min(120, len / 4);
  const opacity = Math.min(1, Math.max(0, Math.min(outMs - o.startMs, o.endMs - outMs) / fade));
  return { scale: 1 + 0.08 * p, opacity };
}

/** The overlay showing at an output time, if any. */
export function brollAt(overlays: BrollOverlay[], outMs: number): BrollOverlay | undefined {
  return overlays.find((o) => outMs >= o.startMs && outMs < o.endMs);
}

/** Every mediaId the b-roll track references (for the renderer's media map). */
export function brollMediaIds(doc: EditDoc): string[] {
  return [...new Set(doc.tracks.broll.map((t) => t.ref))];
}
