import { describe, expect, it } from "vitest";
import { qcMedia } from "@eyelore/core";
import { audioLevels, FrameSampler, lumaPlane, meanAbsDiff, SAMPLE_EVERY_MS } from "./frame-sampler";

/** A w×h RGBA frame of one grey level, with an optional bright square at (x, y) (a "face" that moves). */
function frame(level: number, square?: { x: number; y: number }, w = 32, h = 32): Uint8ClampedArray {
  const px = new Uint8ClampedArray(w * h * 4);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const on = square && x >= square.x && x < square.x + 6 && y >= square.y && y < square.y + 6;
      const v = on ? 230 : level;
      px.set([v, v, v, 255], (y * w + x) * 4);
    }
  }
  return px;
}

/** Feed the sampler a 30 fps render the way frameTap does: only due frames are pushed. */
function render(sampler: FrameSampler, seconds: number, pick: (tMs: number) => Uint8ClampedArray) {
  for (let f = 0; f < seconds * 30; f++) {
    const tMs = (f * 1000) / 30;
    if (sampler.due(tMs)) sampler.push(pick(tMs));
  }
}

describe("frame sampler", () => {
  it("luma is Rec. 601 brightness, 0–1", () => {
    expect(lumaPlane(new Uint8ClampedArray([255, 255, 255, 255]))[0]).toBeCloseTo(1, 5);
    expect(lumaPlane(new Uint8ClampedArray([255, 0, 0, 255]))[0]).toBeCloseTo(0.299, 3);
    expect(meanAbsDiff(lumaPlane(frame(0)), lumaPlane(frame(255)))).toBeCloseTo(1, 5);
  });

  it("takes one sample per 200 ms of output, whatever the frame rate", () => {
    const s = new FrameSampler();
    render(s, 3, () => frame(100));
    expect(s.luma).toHaveLength(Math.ceil(3000 / SAMPLE_EVERY_MS));
    expect(s.diff[0]).toBe(0); // the first sample has nothing to compare with
  });

  it("a moving picture passes qc.ts; black and a held frame in the middle are caught where they are", () => {
    const moving = (tMs: number) => frame(90, { x: Math.round(tMs / 100) % 26, y: 10 });
    const ok = new FrameSampler();
    render(ok, 6, moving);
    expect(qcMedia(ok.stats(6000, { peakDb: -2, rmsDb: -20, clippedRatio: 0 }), { durationMs: 6000, hasSpeech: true })).toEqual([]);

    const bad = new FrameSampler();
    render(bad, 6, (t) => (t >= 1000 && t < 2000 ? frame(0) : t >= 3000 && t < 4600 ? frame(90, { x: 4, y: 4 }) : moving(t)));
    const issues = qcMedia(bad.stats(6000, { peakDb: -2, rmsDb: -20, clippedRatio: 0 }), { durationMs: 6000, hasSpeech: true });
    expect(issues.map((i) => [i.code, i.atMs])).toEqual([
      ["black_frames", 1000],
      ["frozen_frames", 3200], // the first held sample still differs from the moving one before it
    ]);
  });

  it("audio levels: peak and RMS in dBFS, clipped share, silence as -120", () => {
    const sine = Float32Array.from({ length: 48_000 }, (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / 48_000));
    const l = audioLevels([sine]);
    expect(l.peakDb).toBeCloseTo(-6.02, 1);
    expect(l.rmsDb).toBeCloseTo(-9.03, 1);
    expect(l.clippedRatio).toBe(0);
    const hot = Float32Array.from(sine, (x) => Math.max(-1, Math.min(1, x * 4)));
    expect(audioLevels([hot]).clippedRatio).toBeGreaterThan(0.1);
    expect(audioLevels([new Float32Array(100)])).toEqual({ peakDb: -120, rmsDb: -120, clippedRatio: 0 });
  });
});
