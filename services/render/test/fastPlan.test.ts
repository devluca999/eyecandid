import { describe, expect, it } from "vitest";
import { applyChange, canRenderFast, dialChanges, EditDoc, emptyEditDoc, fastPlan, framesOf, toTimeline, FastPlan } from "@eyelore/core";
import { shotBox } from "../src/Cut";

const w = (id: string, text: string, s: number, e: number, struck = false) => ({ id, text, startMs: s, endMs: e, conf: 1, struck });

/** two beads with a struck pause and an L/J cut, a second clip, a moving face track, energy punch-ins */
function doc() {
  let d = emptyEditDoc("p");
  d.clips = [
    { id: "c1", mediaId: "m1", source: "camera", w: 1920, h: 1080, durationMs: 9000, fps: 30 },
    { id: "c2", mediaId: "m2", source: "camera", w: 1080, h: 1920, durationMs: 3000, fps: 30 },
  ];
  d.beads = [
    {
      id: "b1", clipId: "c1", inMs: 0, outMs: 3000, struck: false, moment: "hook",
      words: [w("w1", "this", 100, 400), w("w2", "ring", 450, 800), w("w3", "tracks", 850, 1300), w("w4", "your", 2000, 2300), w("w5", "sleep.", 2350, 2800)],
      cuts: [{ id: "k1", startMs: 1440, endMs: 1920, kind: "silence", struck: true }],
    },
    {
      id: "b2", clipId: "c1", inMs: 3000, outMs: 6000, struck: false,
      words: [w("w6", "it", 3700, 3800), w("w7", "lasts", 3850, 4200), w("w8", "a", 4250, 4300), w("w9", "week.", 4350, 4800)],
      cuts: [{ id: "k2", startMs: 3000, endMs: 3620, kind: "silence", struck: true }],
    },
    { id: "b3", clipId: "c2", inMs: 200, outMs: 1500, struck: false, cuts: [], words: [w("w10", "link", 300, 600), w("w11", "below.", 650, 1100)] },
  ];
  d.reframe = { c1: [{ ms: 0, cx: 0.3, cy: 0.4, scale: 1 }, { ms: 2500, cx: 0.55, cy: 0.45, scale: 1 }, { ms: 5000, cx: 0.98, cy: 0.5, scale: 1 }] };
  d = EditDoc.parse(d);
  for (const c of dialChanges(d, { pace: 0.5, brollDensity: 0, energy: 1 })) d = applyChange(d, c)!.doc;
  return d;
}

/** the crop the plan asks ffmpeg for at output frame n, as an output-pixel box like shotBox's */
function planBox(plan: FastPlan, n: number) {
  let at = 0;
  for (const s of plan.shots) {
    if (n < at + s.frames) {
      const k = n - at;
      const i = s.path.findIndex((p) => p.f > k);
      const [a, b] = i <= 0 ? [s.path.at(i === 0 ? 0 : -1)!, s.path.at(i === 0 ? 0 : -1)!] : [s.path[i - 1]!, s.path[i]!];
      const t = b.f === a.f ? 0 : (k - a.f) / (b.f - a.f);
      const width = plan.width / s.w;
      const height = plan.height / s.h;
      return { mediaId: s.mediaId, srcFrame: s.srcFrame + k, left: -(a.x + (b.x - a.x) * t) * width, top: -(a.y + (b.y - a.y) * t) * height, width, height };
    }
    at += s.frames;
  }
  throw new Error(`frame ${n} not covered`);
}

describe("fast render plan (ADR 0017)", () => {
  it("draws, frame by frame, the source frame and the box the Cut composition draws", () => {
    const d = doc();
    const plan = fastPlan(d, "9:16");
    const tl = toTimeline(d);
    expect(tl.joins.length).toBeGreaterThan(0); // J/L leads are in play
    expect(plan.shots.some((s) => s.w < 0.99)).toBe(true); // and punch-ins
    expect(plan.shots.reduce((a, s) => a + s.frames, 0)).toBe(plan.frames);
    let checked = 0;
    for (const p of tl.picture) {
      const f = framesOf(p, 30);
      for (let k = 0; k < f.frames; k++) {
        const want = shotBox(d, p, 1080, 1920, p.fromMs + (k / 30) * 1000)!;
        const got = planBox(plan, f.from + k);
        expect(got.mediaId).toBe(p.mediaId);
        expect(got.srcFrame).toBe(f.trimBefore + k); // OffthreadVideo startFrom + frame
        expect(got.width).toBeCloseTo(want.width, 1);
        expect(got.height).toBeCloseTo(want.height, 1);
        expect(Math.abs(got.left - want.left)).toBeLessThan(0.5);
        expect(Math.abs(got.top - want.top)).toBeLessThan(0.5);
        checked++;
      }
    }
    expect(checked).toBe(plan.frames);
  });

  it("shows each caption on the frames Captions shows it", () => {
    const d = doc();
    const plan = fastPlan(d, "9:16");
    const chunks = toTimeline(d).captions;
    for (let n = 0; n < plan.frames; n++) {
      const ms = (n / 30) * 1000;
      const want = chunks.find((x) => ms >= x.startMs && ms < x.endMs)?.text;
      const got = plan.captions.find((c) => n >= c.from && n < c.to)?.text;
      expect(got).toBe(want);
    }
    expect(plan.captionAt).toEqual({ y: 0.64, anchor: "top" });
    const placed = fastPlan({ ...d, captions: { ...d.captions, place: { "9:16": 0.42 } } }, "9:16");
    expect(placed.captionAt).toEqual({ y: 0.42, anchor: "middle" });
  });

  it("is only for free exports without generated stills, and fits the render contract", () => {
    const d = doc();
    expect(canRenderFast(d, "free")).toBe(true);
    expect(canRenderFast(d, "pro")).toBe(false);
    const withStill = { ...d, tracks: { ...d.tracks, broll: [{ id: "s1", ref: "still1", startMs: 0, durationMs: 0, params: { beadId: "b1" } }] } };
    expect(canRenderFast(EditDoc.parse(withStill), "free")).toBe(false);
    expect(FastPlan.parse(fastPlan(d, "16:9")).width).toBe(1920);
  });
});
