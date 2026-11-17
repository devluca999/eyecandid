import { describe, expect, it } from "vitest";
import { applyChange, dialChanges, EditDoc, emptyEditDoc, toTimeline, type DialValues } from "@eyelore/core";
import { shotBox } from "../src/Cut";

const w = (id: string, text: string, s: number, e: number) => ({ id, text, startMs: s, endMs: e, conf: 1, struck: false });

function doc() {
  const d = emptyEditDoc("p");
  d.clips = [{ id: "c1", mediaId: "m1", source: "camera", w: 1920, h: 1080, durationMs: 5000, fps: 30 }];
  d.beads = [
    { id: "b1", clipId: "c1", inMs: 0, outMs: 2000, cuts: [], struck: false, moment: "hook", words: [w("w1", "this", 100, 400), w("w2", "ring.", 450, 900)] },
    { id: "b2", clipId: "c1", inMs: 2000, outMs: 4000, cuts: [], struck: false, words: [w("w3", "link", 2100, 2400), w("w4", "below.", 2450, 2900)] },
  ];
  return EditDoc.parse(d);
}
function dialled(energy: number) {
  let d = doc();
  const dials: DialValues = { pace: 0.5, brollDensity: 0.3, energy };
  for (const c of dialChanges(d, dials)) d = applyChange(d, c)!.doc;
  return d;
}

describe("energy punch-ins in the export", () => {
  it("pushes in on the hook bead by the dial's scale, face-centred, still covering the frame", () => {
    const seg = toTimeline(doc()).segments[0]!;
    const plain = shotBox(doc(), seg, 1080, 1920, 500)!;
    const punched = shotBox(dialled(1), seg, 1080, 1920, 500)!;
    expect(punched.height / plain.height).toBeCloseTo(1.12, 5);
    expect(punched.left + punched.width / 2).toBeCloseTo(540, 5);
    expect(punched.top).toBeLessThanOrEqual(0);
    expect(punched.top + punched.height).toBeGreaterThanOrEqual(1920);
  });

  it("leaves beads without a punch-in as shot, and the cut as shot at energy 0.5", () => {
    const seg = toTimeline(doc()).segments[0]!;
    const plain = shotBox(doc(), seg, 1080, 1920, 500)!;
    const mid = dialled(0.6); // hook and best line only
    expect(shotBox(mid, seg, 1080, 1920, 500)!.height / plain.height).toBeCloseTo(1.06, 5);
    expect(shotBox(mid, seg, 1080, 1920, 2500)!.height).toBeCloseTo(plain.height, 5);
    expect(shotBox(dialled(0.5), seg, 1080, 1920, 500)!.height).toBeCloseTo(plain.height, 5);
  });
});
