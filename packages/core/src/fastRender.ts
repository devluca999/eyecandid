import { z } from "zod";
import type { Aspect, EditDoc } from "./editModel";
import { brollOverlays } from "./broll";
import { FRAME_SIZE, CAPTION_DEFAULT_TOP } from "./captions";
import { punchAt } from "./dials";
import { coverBox, faceAt } from "./reframe";
import { framesOf, toTimeline } from "./timeline";

/** Both server renderers run at this rate (services/render Root.tsx). */
export const RENDER_FPS = 30;

/**
 * The fast free render's picture and captions, planned here so the worker's ffmpeg graph draws exactly what the Cut
 * composition draws (ADR 0017). Frames are on the 30 fps output grid; crops are fractions of the source frame.
 */
export const FastPlan = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.number().int().positive(),
  /** total output frames (Remotion's durationInFrames) */
  frames: z.number().int().positive(),
  /**
   * Back-to-back shots tiling the output. A shot shows source frames [srcFrame, srcFrame + frames) of one media, cropped
   * to a box of constant size (w, h) whose corner follows `path` (x, y at frame offsets `f`, linear in between).
   */
  shots: z.array(
    z.object({
      mediaId: z.string().min(1),
      srcFrame: z.number().int().nonnegative(),
      frames: z.number().int().positive(),
      w: z.number().positive().max(1),
      h: z.number().positive().max(1),
      path: z.array(z.object({ f: z.number().int().nonnegative(), x: z.number().min(0).max(1), y: z.number().min(0).max(1) })).min(1),
    }),
  ),
  /** caption chunks on output frames [from, to) */
  captions: z.array(z.object({ from: z.number().int().nonnegative(), to: z.number().int().nonnegative(), text: z.string() })),
  /** where the caption block sits: its top edge, or its centre, as a fraction of the frame height (captionCss) */
  captionAt: z.object({ y: z.number().min(0).max(1), anchor: z.enum(["top", "middle"]) }),
});
export type FastPlan = z.infer<typeof FastPlan>;

/** Whether an export can take the fast ffmpeg path: free, and nothing on screen the ffmpeg graph doesn't draw. */
export function canRenderFast(doc: EditDoc, plan: string): boolean {
  return plan === "free" && brollOverlays(doc).length === 0;
}

/** sub-pixel tolerance (output px) when thinning a crop path */
const PATH_TOLERANCE_PX = 0.35;

/**
 * Edit model → fast render plan. Mirrors Cut.tsx frame for frame: the picture pieces from toTimeline (J/L leads
 * included) placed with framesOf, each frame's box from coverBox(faceAt × punchAt) at the same source time Shot uses,
 * captions shown on the frames where Captions shows them.
 */
export function fastPlan(doc: EditDoc, aspect: Aspect): FastPlan {
  const fps = RENDER_FPS;
  const [W, H] = FRAME_SIZE[aspect];
  const tl = toTimeline(doc);
  const clips = new Map(doc.clips.map((c) => [c.id, c]));
  const shots: FastPlan["shots"] = [];
  for (const p of tl.picture) {
    const f = framesOf(p, fps);
    const clip = clips.get(p.clipId);
    if (f.frames <= 0 || !clip) continue;
    // per output frame: the box Shot draws, as a crop of the source
    let run: { w: number; h: number; pts: { f: number; x: number; y: number }[]; start: number } | null = null;
    const flush = () => {
      if (!run) return;
      // one source fraction is W / w output px across (H / h down)
      const tol = PATH_TOLERANCE_PX * Math.min(run.w / W, run.h / H);
      shots.push({ mediaId: p.mediaId, srcFrame: f.trimBefore + run.start, frames: run.pts.length, w: round6(run.w), h: round6(run.h), path: thin(run.pts, tol) });
    };
    for (let k = 0; k < f.frames; k++) {
      const srcMs = p.fromMs + (k / fps) * 1000;
      const face = faceAt(doc.reframe[clip.id], srcMs);
      const box = coverBox(clip.w, clip.h, W, H, { ...face, scale: face.scale * punchAt(doc, clip.id, srcMs) });
      const w = W / box.width;
      const h = H / box.height;
      const x = clamp01(-box.left / box.width);
      const y = clamp01(-box.top / box.height);
      if (!run || Math.abs(run.w - w) > 1e-6 || Math.abs(run.h - h) > 1e-6) {
        flush();
        run = { w, h, pts: [], start: k };
      }
      run.pts.push({ f: k - run.start, x, y });
    }
    flush();
  }
  const frames = Math.max(fps, Math.round((tl.durationMs / 1000) * fps));
  // Captions shows a chunk on frame n when startMs <= n/fps*1000 < endMs
  const first = (ms: number) => Math.max(0, Math.ceil((ms * fps) / 1000 - 1e-9));
  const captions = tl.captions.map((c) => ({ from: first(c.startMs), to: Math.min(frames, first(c.endMs)), text: c.text })).filter((c) => c.to > c.from);
  const place = doc.captions.place?.[aspect];
  return {
    width: W,
    height: H,
    fps,
    frames,
    shots,
    captions,
    captionAt: place === undefined ? { y: CAPTION_DEFAULT_TOP, anchor: "top" } : { y: place, anchor: "middle" },
  };
}

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const round6 = (v: number) => Math.round(v * 1e6) / 1e6;

/** Douglas–Peucker on (f, x) and (f, y) together: keep the frames a linear path through the rest can't stand in for. */
function thin(pts: { f: number; x: number; y: number }[], tol: number): { f: number; x: number; y: number }[] {
  if (pts.length <= 2) return pts.map(r6);
  const keep = new Set([0, pts.length - 1]);
  const stack: [number, number][] = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop()!;
    const A = pts[a]!;
    const B = pts[b]!;
    let worst = -1;
    let at = -1;
    for (let i = a + 1; i < b; i++) {
      const P = pts[i]!;
      const t = (P.f - A.f) / (B.f - A.f);
      const d = Math.max(Math.abs(A.x + (B.x - A.x) * t - P.x), Math.abs(A.y + (B.y - A.y) * t - P.y));
      if (d > worst) [worst, at] = [d, i];
    }
    if (worst > tol) {
      keep.add(at);
      stack.push([a, at], [at, b]);
    }
  }
  return [...keep].sort((m, n) => m - n).map((i) => r6(pts[i]!));
}
const r6 = (p: { f: number; x: number; y: number }) => ({ f: p.f, x: round6(p.x), y: round6(p.y) });
