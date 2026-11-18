import type { Aspect } from "./editModel";

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
