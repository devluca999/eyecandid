import type { Aspect, EditDoc } from "./editModel";
import { coverBox } from "./reframe";

/** Characters per caption line for 9:16 (two lines of this at most). */
export const CAPTION_MAX_CHARS = 18;

/**
 * Split caption text into one line, or two balanced lines (the most even split at a space; when it can't fit the
 * limit, the split that overflows least). A single word longer than the limit stays one line.
 */
export function captionLines(text: string, maxChars = CAPTION_MAX_CHARS): [string] | [string, string] {
  const t = text.trim().replace(/\s+/g, " ");
  if (t.length <= maxChars) return [t];
  const parts = t.split(" ");
  if (parts.length < 2) return [t];
  let best: [string, string] = [parts[0]!, parts.slice(1).join(" ")];
  let bestScore = Infinity;
  for (let i = 1; i < parts.length; i++) {
    const a = parts.slice(0, i).join(" ");
    const b = parts.slice(i).join(" ");
    const over = Math.max(0, a.length - maxChars) + Math.max(0, b.length - maxChars);
    // fit first, then balance; on a tie the shorter top line wins (reads as a pyramid)
    const score = over * 1000 + Math.abs(a.length - b.length) * 2 + (a.length > b.length ? 1 : 0);
    if (score < bestScore) [best, bestScore] = [[a, b], score];
  }
  return best;
}

/** Whether text fits in at most two lines of maxChars. */
export function fitsTwoLines(text: string, maxChars = CAPTION_MAX_CHARS): boolean {
  return captionLines(text, maxChars).every((l) => l.length <= maxChars);
}

/** Platform UI keeps these strips of the frame busy (fractions of height): captions stay out of them. */
const SAFE: Record<Aspect, { top: number; bottom: number; band: number }> = {
  "9:16": { top: 0.12, bottom: 0.22, band: 0.14 },
  "4:5": { top: 0.08, bottom: 0.14, band: 0.16 },
  "1:1": { top: 0.08, bottom: 0.12, band: 0.18 },
  "16:9": { top: 0.06, bottom: 0.1, band: 0.22 },
};
/** captions keep their centre at least this far (fraction of frame height) from the face centre */
export const CAPTION_FACE_CLEARANCE = 0.18;

/**
 * Where captions may sit, as top/bottom fractions of frame height: inside the platform's safe area and off the face.
 * Prefers the lowest spot the safe area allows (the lower third); with the reframed face centre `faceCy`, moves up or
 * down just enough to keep clear of it, or, if nothing in the safe area is clear, as far from the face as it can.
 */
export function captionBand(aspect: Aspect, faceCy?: number): { top: number; bottom: number } {
  const s = SAFE[aspect];
  const lo = s.top + s.band / 2; // highest centre allowed
  const hi = 1 - s.bottom - s.band / 2; // lowest centre allowed
  let c = hi;
  if (faceCy !== undefined && Number.isFinite(faceCy) && Math.abs(c - faceCy) < CAPTION_FACE_CLEARANCE) {
    const below = faceCy + CAPTION_FACE_CLEARANCE;
    const above = faceCy - CAPTION_FACE_CLEARANCE;
    if (below <= hi) c = Math.max(below, lo);
    else if (above >= lo) c = Math.min(above, hi);
    else c = Math.abs(hi - faceCy) >= Math.abs(lo - faceCy) ? hi : lo;
  }
  const r = (x: number) => Math.round(x * 1000) / 1000;
  return { top: r(c - s.band / 2), bottom: r(c + s.band / 2) };
}

/** Output frame size per aspect (both renderers). */
export const FRAME_SIZE: Record<Aspect, [number, number]> = { "9:16": [1080, 1920], "4:5": [1080, 1350], "1:1": [1080, 1080], "16:9": [1920, 1080] };
/** The renderers' default caption spot: the box's top edge at 64% of the frame height. */
export const CAPTION_DEFAULT_TOP = 0.64;
/** Caption line height as a fraction of frame width (22/26 type at a 390 pt phone width, scaled to the frame). */
export const CAPTION_LINE = 26 / 390;

/** How many lines a caption takes when the renderer wraps it (three when it can't fit two). */
export function captionLineCount(text: string): number {
  return fitsTwoLines(text) ? captionLines(text).length : 3;
}

/**
 * Where the face (the reframe track's mouth point) sits in the output frame, as a fraction of its height: the median
 * over the doc's keyframes. Undefined when the doc has no face track.
 */
export function outputFaceCy(doc: EditDoc, aspect: Aspect): number | undefined {
  const [W, H] = FRAME_SIZE[aspect];
  const ys: number[] = [];
  for (const clip of doc.clips) {
    for (const k of doc.reframe[clip.id] ?? []) {
      const box = coverBox(clip.w, clip.h, W, H, k);
      ys.push((box.top + k.cy * box.height) / H);
    }
  }
  if (!ys.length) return undefined;
  ys.sort((a, b) => a - b);
  return ys[Math.floor(ys.length / 2)]!;
}

/**
 * Where a caption is drawn, as top/bottom fractions of frame height. One function for both renderers and the quality
 * check: `doc.captions.place[aspect]` (a centre) when set, else the default spot.
 */
export function captionBox(doc: EditDoc, aspect: Aspect, lines: number): { top: number; bottom: number } {
  const [W, H] = FRAME_SIZE[aspect];
  const h = (lines * CAPTION_LINE * W) / H;
  const c = doc.captions.place?.[aspect];
  return c === undefined ? { top: CAPTION_DEFAULT_TOP, bottom: CAPTION_DEFAULT_TOP + h } : { top: c - h / 2, bottom: c + h / 2 };
}

/**
 * The caption centre the quality check moves captions to: the safe band off the face (captionBand), shifted just
 * enough that a two-line caption stays inside the safe area.
 */
export function captionFixCentre(aspect: Aspect, faceCy?: number): number {
  const b = captionBand(aspect, faceCy);
  const [W, H] = FRAME_SIZE[aspect];
  const h = (2 * CAPTION_LINE * W) / H;
  const s = safeArea(aspect);
  const c = Math.min(Math.max((b.top + b.bottom) / 2, s.top + h / 2), s.bottom - h / 2);
  return Math.round(c * 1000) / 1000;
}

/** CSS for the caption block in a renderer (left/right are the renderer's own). */
export function captionCss(doc: EditDoc, aspect: Aspect): { top: string; transform?: string } {
  const c = doc.captions.place?.[aspect];
  return c === undefined ? { top: `${CAPTION_DEFAULT_TOP * 100}%` } : { top: `${c * 100}%`, transform: "translateY(-50%)" };
}

/** Platform safe area for an aspect, as top/bottom fractions captions must stay inside. */
export function safeArea(aspect: Aspect): { top: number; bottom: number } {
  const s = SAFE[aspect];
  return { top: s.top, bottom: 1 - s.bottom };
}
