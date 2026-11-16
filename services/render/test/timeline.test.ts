import { describe, expect, it } from "vitest";
import { EditDoc, emptyEditDoc } from "@eyelore/core";
import { toTimeline } from "@eyelore/core";

const w = (id: string, text: string, s: number, e: number, struck = false) => ({ id, text, startMs: s, endMs: e, conf: 1, struck });

function doc() {
  const d = emptyEditDoc("p");
  d.clips = [{ id: "c1", mediaId: "m1", source: "camera", w: 1080, h: 1920, durationMs: 5000, fps: 30 }];
  d.beads = [
    { id: "b1", clipId: "c1", inMs: 0, outMs: 2000, cuts: [], struck: false, words: [w("w1", "um", 0, 300, true), w("w2", "this", 400, 700), w("w3", "ring.", 750, 1100)] },
    { id: "b2", clipId: "c1", inMs: 2000, outMs: 3000, cuts: [], struck: true, words: [w("w4", "oops", 2100, 2400)] },
    { id: "b3", clipId: "c1", inMs: 3000, outMs: 4000, cuts: [], struck: false, words: [w("w5", "link", 3100, 3400), w("w6", "below.", 3450, 3800)] },
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

import { coverBox, faceAt } from "@eyelore/core";

describe("silences and reframe", () => {
  it("drops struck silences and keeps restored ones", () => {
    const d = doc();
    d.beads[0]!.cuts = [{ id: "s1", startMs: 1100, endMs: 1800, kind: "silence", struck: true }];
    expect(toTimeline(d).durationMs).toBe(2700 - 700);
    d.beads[0]!.cuts[0]!.struck = false;
    expect(toTimeline(d).durationMs).toBe(2700);
  });
  it("keeps the face centred in 9:16 from a 16:9 source, clamped to the frame", () => {
    const box = coverBox(1920, 1080, 1080, 1920, { cx: 0.7, cy: 0.5, scale: 1 });
    expect(box.height).toBe(1920);
    expect(box.left + 0.7 * box.width).toBeCloseTo(540, 0); // face at horizontal centre
    const edge = coverBox(1920, 1080, 1080, 1920, { cx: 0.99, cy: 0.5, scale: 1 });
    expect(edge.left).toBeCloseTo(1080 - edge.width, 5); // can't show past the source edge
    expect(faceAt([{ ms: 0, cx: 0.2, cy: 0.5, scale: 1 }, { ms: 1000, cx: 0.6, cy: 0.5, scale: 1 }], 500).cx).toBeCloseTo(0.4);
  });
});

describe("handles around struck words", () => {
  it("keep 40ms of a struck word next to a tightly joined kept word, and nothing at a bead edge", () => {
    const d = doc();
    // "this" (400-700) now runs straight into a struck "like" (700-1000) and then "ring." (1000-1300)
    d.beads[0]!.words = [w("w1", "um", 0, 300, true), w("w2", "this", 400, 700), w("wx", "like", 700, 1000, true), w("w3", "ring.", 1000, 1300)];
    d.beads[0]!.outMs = 1300;
    const segs = toTimeline(d).segments.filter((s) => s.toMs <= 1300);
    // "um" at the bead edge: cut fully; "like": 40ms handles kept on both sides
    expect(segs.map((s) => [s.fromMs, s.toMs])).toEqual([[300, 740], [960, 1300]]);
  });
});
