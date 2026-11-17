import { describe, expect, it } from "vitest";
import { faceAt, ReframeKeyframe, smoothFaceTrack, type FaceSample } from "../src";

const box = (cx: number, cy: number, w = 0.2, h = 0.2) => ({ x: cx - w / 2, y: cy - h / 2, w, h });

describe("smoothFaceTrack (twin of the server reframe handler)", () => {
  it("no face anywhere → one centred keyframe, faces = 0", () => {
    const s: FaceSample[] = [0, 250, 500].map((ms) => ({ ms, face: null }));
    expect(smoothFaceTrack(s)).toEqual({ keyframes: [{ ms: 0, cx: 0.5, cy: 0.5, scale: 1 }], faces: 0 });
  });

  it("a still face collapses to a single keyframe, centre nudged to the mouth", () => {
    const s: FaceSample[] = Array.from({ length: 40 }, (_, i) => ({ ms: i * 250, face: box(0.4, 0.3) }));
    const r = smoothFaceTrack(s);
    expect(r.faces).toBe(40);
    expect(r.keyframes).toHaveLength(1);
    expect(r.keyframes[0]!.cx).toBeCloseTo(0.4, 3);
    expect(r.keyframes[0]!.cy).toBeCloseTo(0.2 + 0.2 * 0.55, 3); // y + h*0.55
  });

  it("a face that walks right then is lost: smoothed (lags), thinned, holds the last position, stays valid", () => {
    const s: FaceSample[] = [];
    for (let i = 0; i < 20; i++) s.push({ ms: i * 250, face: box(0.3 + i * 0.02, 0.35) }); // 0.3 → 0.68
    for (let i = 20; i < 30; i++) s.push({ ms: i * 250, face: null });
    const r = smoothFaceTrack(s);
    expect(r.faces).toBe(20);
    expect(r.keyframes.length).toBeLessThan(30); // thinned
    expect(r.keyframes.length).toBeGreaterThan(3);
    const first = r.keyframes[0]!;
    expect(first.cx).toBeCloseTo(0.3, 3);
    // monotone rightwards, always behind the raw track (EMA lag), every step > 0.01
    for (let i = 1; i < r.keyframes.length; i++) {
      expect(r.keyframes[i]!.cx).toBeGreaterThan(r.keyframes[i - 1]!.cx);
      expect(r.keyframes[i]!.cx - r.keyframes[i - 1]!.cx).toBeGreaterThan(0.01);
      expect(r.keyframes[i]!.ms).toBeGreaterThan(r.keyframes[i - 1]!.ms);
    }
    expect(r.keyframes.at(-1)!.cx).toBeLessThan(0.68);
    expect(r.keyframes.at(-1)!.cx).toBeGreaterThan(0.55);
    for (const k of r.keyframes) expect(ReframeKeyframe.safeParse(k).success).toBe(true);
    // the track drives faceAt (what the renderer calls)
    expect(faceAt(r.keyframes, 0).cx).toBeCloseTo(0.3, 3);
  });

  it("a face lost at the start holds centre until found, and a single outlier is damped by the EMA", () => {
    const s: FaceSample[] = [{ ms: 0, face: null }, { ms: 250, face: box(0.5, 0.3) }, { ms: 500, face: box(0.9, 0.3) }, { ms: 750, face: box(0.5, 0.3) }];
    const r = smoothFaceTrack(s);
    expect(r.faces).toBe(3);
    expect(Math.max(...r.keyframes.map((k) => k.cx))).toBeLessThan(0.7); // never reaches the 0.9 outlier
  });
});
