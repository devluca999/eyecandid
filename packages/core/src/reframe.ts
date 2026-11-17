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

/** One sampled frame: the largest face's box in normalised 0..1 source coords, or null when none was found. */
export type FaceSample = { ms: number; face: { x: number; y: number; w: number; h: number } | null };

/**
 * Raw per-frame face boxes → smoothed, thinned reframe keyframes. The TS twin of
 * services/engine/eyelore_engine/handlers/reframe.py: the centre is nudged to the mouth (cy = y + h*0.55), frames
 * with no face hold the last position, the track is smoothed with an EMA (alpha 0.35), and keyframes that barely
 * move (<= 0.01 on both axes) are thinned out. No face at all → one centred keyframe and faces = 0.
 */
export function smoothFaceTrack(samples: FaceSample[], alpha = 0.35, thin = 0.01): { keyframes: ReframeKeyframe[]; faces: number } {
  const raw: { ms: number; x: number; y: number; found: boolean }[] = [];
  for (const s of samples) {
    const prev = raw[raw.length - 1];
    if (s.face) raw.push({ ms: s.ms, x: s.face.x + s.face.w / 2, y: s.face.y + s.face.h * 0.55, found: true });
    else raw.push({ ms: s.ms, x: prev?.x ?? 0.5, y: prev?.y ?? 0.5, found: false });
  }
  const faces = raw.filter((r) => r.found).length;
  if (faces === 0) return { keyframes: [{ ms: 0, cx: 0.5, cy: 0.5, scale: 1 }], faces: 0 };
  const kfs: ReframeKeyframe[] = [];
  let cx = raw[0]!.x;
  let cy = raw[0]!.y;
  const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
  for (const r of raw) {
    cx += alpha * (r.x - cx);
    cy += alpha * (r.y - cy);
    const last = kfs[kfs.length - 1];
    if (!last || Math.abs(cx - last.cx) > thin || Math.abs(cy - last.cy) > thin) {
      kfs.push({ ms: Math.round(r.ms), cx: Math.round(clamp01(cx) * 1e4) / 1e4, cy: Math.round(clamp01(cy) * 1e4) / 1e4, scale: 1 });
    }
  }
  return { keyframes: kfs, faces };
}
