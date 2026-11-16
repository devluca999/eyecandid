import type { ReframeKeyframe } from "./editModel";

/** Face position at source time `ms`, linearly interpolated between keyframes (centre if none). */
export function faceAt(kfs: ReframeKeyframe[] | undefined, ms: number): { cx: number; cy: number; scale: number } {
  if (!kfs || kfs.length === 0) return { cx: 0.5, cy: 0.5, scale: 1 };
  if (ms <= kfs[0]!.ms) return kfs[0]!;
  for (let i = 1; i < kfs.length; i++) {
    const a = kfs[i - 1]!;
    const b = kfs[i]!;
    if (ms <= b.ms) {
      const t = (ms - a.ms) / Math.max(1, b.ms - a.ms);
      return { cx: a.cx + (b.cx - a.cx) * t, cy: a.cy + (b.cy - a.cy) * t, scale: a.scale + (b.scale - a.scale) * t };
    }
  }
  return kfs[kfs.length - 1]!;
}

/**
 * Place a w×h source inside a W×H frame so it covers the frame and the face sits as close to centre as the
 * frame edges allow. Returns the video's box in output pixels.
 */
export function coverBox(w: number, h: number, W: number, H: number, face: { cx: number; cy: number; scale: number }) {
  const s = Math.max(W / w, H / h) * face.scale;
  const vw = w * s;
  const vh = h * s;
  const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
  const left = clamp(W / 2 - face.cx * vw, W - vw, 0);
  const top = clamp(H / 2 - face.cy * vh, H - vh, 0);
  return { left, top, width: vw, height: vh };
}
