import { describe, expect, it } from "vitest";
import { EditDoc, emptyEditDoc } from "@eyelore/core";
import { toTimeline } from "../src/timeline";

const w = (id: string, text: string, s: number, e: number, struck = false) => ({ id, text, startMs: s, endMs: e, conf: 1, struck });

function doc() {
  const d = emptyEditDoc("p");
  d.clips = [{ id: "c1", mediaId: "m1", source: "camera", w: 1080, h: 1920, durationMs: 5000, fps: 30 }];
  d.beads = [
    { id: "b1", clipId: "c1", inMs: 0, outMs: 2000, struck: false, words: [w("w1", "um", 0, 300, true), w("w2", "this", 400, 700), w("w3", "ring.", 750, 1100)] },
    { id: "b2", clipId: "c1", inMs: 2000, outMs: 3000, struck: true, words: [w("w4", "oops", 2100, 2400)] },
    { id: "b3", clipId: "c1", inMs: 3000, outMs: 4000, struck: false, words: [w("w5", "link", 3100, 3400), w("w6", "below.", 3450, 3800)] },
  ];
  return EditDoc.parse(d);
}

describe("toTimeline", () => {
  it("skips struck beads and struck words, keeps the speaker's words exactly", () => {
    const tl = toTimeline(doc());
    expect(tl.segments.map((s) => [s.fromMs, s.toMs])).toEqual([[300, 2000], [3000, 4000]]);
    expect(tl.durationMs).toBe(2700);
    expect(tl.captions.map((c) => c.text)).toEqual(["this ring.", "link below."]);
    expect(tl.captions[1]!.startMs).toBe(1700 + 100);
  });
  it("applies caption spelling overrides and respects captions off", () => {
    const d = doc();
    d.captions.overrides = [{ wordId: "w3", text: "Ring." }];
    expect(toTimeline(d).captions[0]!.text).toBe("this Ring.");
    d.captions.enabled = false;
    expect(toTimeline(d).captions).toEqual([]);
  });
});
