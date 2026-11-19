import { describe, expect, it } from "vitest";
import { GoldenCase, autocut, emptyEditDoc, goldenFromEditDoc, keptRanges, mergeRanges, scoreCut, summarise, applyOps, type EditDoc } from "../src";

const r = (startMs: number, endMs: number) => ({ startMs, endMs });
const w = (text: string, startMs: number, endMs: number) => ({ text, startMs, endMs, conf: 1 });

describe("keptRanges", () => {
  it("is the spoken span minus strikes, merged and sorted", () => {
    const words = [w("um", 100, 300), w("hi", 400, 600), w("there", 650, 900)];
    const out = { strikes: [{ startMs: 650, endMs: 700, kind: "repeat" as const, reason: "x" }, { startMs: 100, endMs: 300, kind: "filler" as const, reason: "x" }, { startMs: 680, endMs: 750, kind: "silence" as const, reason: "x" }] };
    expect(keptRanges(words, out)).toEqual([r(300, 650), r(750, 900)]);
  });
  it("keeps the whole span when nothing is struck and is empty without words", () => {
    expect(keptRanges([w("a", 50, 100)], { strikes: [] })).toEqual([r(50, 100)]);
    expect(keptRanges([], { strikes: [] })).toEqual([]);
  });
  it("matches autocut output", () => {
    const words = [w("um", 0, 300), w("hello", 400, 700), w("world.", 750, 1100)];
    expect(keptRanges(words, autocut({ words }))).toEqual([r(300, 1100)]);
  });
});

describe("mergeRanges", () => {
  it("merges overlapping and touching, drops empty", () => {
    expect(mergeRanges([r(10, 20), r(0, 10), r(15, 30), r(40, 40)])).toEqual([r(0, 30)]);
  });
});

describe("scoreCut", () => {
  it("scores identical cuts perfectly", () => {
    const s = scoreCut([r(0, 400), r(600, 1000)], [r(0, 400), r(600, 1000)], 1000);
    expect([s.precision, s.recall, s.f1, s.iou]).toEqual([1, 1, 1, 1]);
    expect(s.boundaryErrorMs).toEqual({ p50: 0, p90: 0 });
    expect([s.extraCuts, s.missedCuts, s.removedMsAuto, s.removedMsRef]).toEqual([0, 0, 200, 200]);
  });
  it("computes precision/recall over removed time and IoU over kept time", () => {
    // auto removes [400,600) and [800,1000); ref removes [400,500) and [900,1000)... window 1000
    const s = scoreCut([r(0, 400), r(600, 800)], [r(0, 400), r(500, 900)], 1000);
    // removed auto: 400-600, 800-1000 = 400; removed ref: 400-500, 900-1000 = 200; intersection: 100 + 100 = 200
    expect(s.removedMsAuto).toBe(400);
    expect(s.removedMsRef).toBe(200);
    expect(s.precision).toBeCloseTo(0.5);
    expect(s.recall).toBeCloseTo(1);
    expect(s.f1).toBeCloseTo(2 / 3);
    // kept auto 600, kept ref 800, intersection 400 (0-400) ... 600-800 vs 500-900 = 200; total 600
    expect(s.iou).toBeCloseTo(600 / 800);
  });
  it("matches boundaries within 500 ms one to one and counts extra/missed", () => {
    // auto cut 1000-2000 (boundaries 1000, 2000); ref cut 1100-1900 (1100, 1900) plus a far ref cut 5000-5200
    const s = scoreCut([r(0, 1000), r(2000, 5000), r(5200, 9000)], [r(0, 1100), r(1900, 5000), r(5200, 9000)], 9000);
    expect(s.extraCuts).toBe(0);
    expect(s.missedCuts).toBe(0);
    // errors sorted: 0, 0, 100, 100 -> nearest-rank p50 = 0, p90 = 100
    expect(s.boundaryErrorMs).toEqual({ p50: 0, p90: 100 });
    const far = scoreCut([r(0, 1000), r(2000, 9000)], [r(0, 4000), r(6000, 9000)], 9000);
    expect(far.extraCuts).toBe(2);
    expect(far.missedCuts).toBe(2);
    expect(far.boundaryErrorMs).toEqual({ p50: null, p90: null });
  });
  it("does not let one reference boundary absorb two auto boundaries", () => {
    const s = scoreCut([r(0, 1000), r(1100, 9000)], [r(0, 1050), r(1050, 9000)], 9000);
    // ref has no cut at all; auto has a cut 1000-1100 => 2 extra
    expect(s.extraCuts).toBe(2);
    expect(s.missedCuts).toBe(0);
    const t = scoreCut([r(0, 1000), r(1100, 9000)], [r(0, 1040), r(1200, 9000)], 9000);
    expect(t.extraCuts).toBe(0);
    expect(t.missedCuts).toBe(0);
  });
  it("percentiles are nearest-rank", () => {
    // five 100 ms cuts, 1 s apart; the reference shifts cut k by 10*(k+1) ms, so both edges err by 10,20,30,40,50
    const keep = (shift: (k: number) => number) => {
      const out: { startMs: number; endMs: number }[] = [];
      let cursor = 0;
      for (let k = 0; k < 5; k++) {
        const at = 500 + k * 1000 + shift(k);
        out.push(r(cursor, at));
        cursor = at + 100;
      }
      out.push(r(cursor, 6000));
      return out;
    };
    const s = scoreCut(keep(() => 0), keep((k) => 10 * (k + 1)), 6000);
    expect(s.boundaryErrorMs).toEqual({ p50: 30, p90: 50 });
  });
  it("counts mid-word cuts strictly inside words only", () => {
    const words = [w("hello", 0, 500), w("world", 600, 1000)];
    // auto removes 250-300 (inside hello) and 500-600 (edges exactly on word edges: not mid-word)
    const s = scoreCut([r(0, 250), r(300, 500), r(600, 1000)], [r(0, 1000)], 1000, words);
    expect(s.midWordCuts).toBe(2);
    expect(scoreCut([r(0, 500), r(600, 1000)], [r(0, 1000)], 1000, words).midWordCuts).toBe(0);
    expect(scoreCut([r(0, 250), r(300, 1000)], [r(0, 1000)], 1000).midWordCuts).toBe(0);
  });
  it("handles degenerate cases without NaN", () => {
    const none = scoreCut([r(0, 1000)], [r(0, 1000)], 1000);
    expect(none.f1).toBe(1);
    const autoOnly = scoreCut([r(0, 500)], [r(0, 1000)], 1000);
    expect([autoOnly.precision, autoOnly.recall, autoOnly.f1]).toEqual([0, 1, 0]);
    expect(scoreCut([], [], 1000).iou).toBe(1);
  });
});

describe("summarise", () => {
  it("averages and leaves winRate undefined", () => {
    const a = scoreCut([r(0, 1000)], [r(0, 1000)], 1000);
    const b = scoreCut([r(0, 500)], [r(0, 1000)], 1000);
    const s = summarise([a, b]);
    expect(s.cases).toBe(2);
    expect(s.precision).toBeCloseTo(0.5);
    expect(s.recall).toBeCloseTo(1);
    expect(s.winRate).toBeUndefined();
    expect(summarise([]).cases).toBe(0);
  });
});

describe("goldenFromEditDoc", () => {
  it("derives keep ranges and words from toTimeline segments", () => {
    let doc: EditDoc = emptyEditDoc("p1");
    doc.clips = [{ id: "c1", mediaId: "m1", source: "upload", w: 1080, h: 1920, durationMs: 3000, fps: 30 }];
    doc.beads = [{ id: "b1", clipId: "c1", inMs: 0, outMs: 2000, struck: false, cuts: [{ id: "x1", startMs: 800, endMs: 1200, kind: "silence", struck: true }], words: [
      { id: "w1", text: "hi", startMs: 100, endMs: 400, conf: 1, struck: false },
      { id: "w2", text: "um", startMs: 1300, endMs: 1500, conf: 1, struck: true, strikeKind: "user" },
    ] }];
    doc = applyOps(doc, []).doc;
    const g = goldenFromEditDoc(doc, { id: "case1" });
    expect(GoldenCase.safeParse(g).success).toBe(true);
    expect(g.source).toBe("editor");
    expect(g.words.map((x) => x.text)).toEqual(["hi", "um"]);
    expect(g.reference.keep).toEqual([r(0, 800), r(1200, 1300), r(1500, 2000)].map((x) => x));
    expect(g.durationMs).toBe(3000);
  });
});
