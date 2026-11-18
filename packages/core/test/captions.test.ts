import { describe, expect, it } from "vitest";
import { captionBand, captionLines, chunk, EditDoc, emptyEditDoc, toTimeline, type CaptionWord } from "../src";

/** Words from a spec: a number before a word is the pause before it (default 50ms); each word 200ms. */
function say(spec: (string | number)[]): CaptionWord[] {
  const out: CaptionWord[] = [];
  let t = 0;
  let gap = 0;
  for (const x of spec) {
    if (typeof x === "number") {
      gap = x;
      continue;
    }
    t += out.length ? gap || 50 : 0;
    out.push({ text: x, startMs: t, endMs: t + 200 });
    t += 200;
    gap = 0;
  }
  return out;
}
const texts = (ws: CaptionWord[], opts?: Parameters<typeof chunk>[1]) => chunk(ws, opts).map((c) => c.text);

describe("captionLines", () => {
  it("one line when it fits, else two balanced lines", () => {
    expect(captionLines("link below")).toEqual(["link below"]);
    expect(captionLines("this ring tracks your sleep")).toEqual(["this ring tracks", "your sleep"]);
    expect(captionLines("it lasts a whole week on one")).toEqual(["it lasts a whole", "week on one"]);
    for (const t of ["so today we're going to talk", "a b c d e f g h i j k l m n", "the best ring I have ever owned"]) {
      const lines = captionLines(t);
      expect(lines.join(" ")).toBe(t);
      expect(lines.every((l) => l.length <= 18)).toBe(true);
    }
  });
  it("a single long word stays one line; the limit is a parameter", () => {
    expect(captionLines("supercalifragilistic")).toEqual(["supercalifragilistic"]);
    expect(captionLines("this ring tracks", 8)).toEqual(["this ring", "tracks"]); // overflows least
  });
});

describe("chunk", () => {
  it("fits every chunk in two lines of 18 characters", () => {
    const ws = say(["so", "today", "we're", "going", "to", "talk", "about", "the", "best", "sleep", "tracking", "ring", "you", "can", "buy", "right", "now"]);
    const out = chunk(ws);
    for (const c of out) expect(captionLines(c.text).every((l) => l.length <= 18)).toBe(true);
    expect(out.map((c) => c.text).join(" ")).toBe(ws.map((w) => w.text).join(" "));
    expect(texts(ws, { maxChars: 10 }).every((t) => captionLines(t, 10).every((l) => l.length <= 10))).toBe(true);
  });
  it("breaks at punctuation and at pauses of 300ms or more", () => {
    expect(texts(say(["this", "ring", "tracks", "sleep.", "it", "lasts", "a", "week."]))).toEqual(["this ring tracks sleep.", "it lasts a week."]);
    expect(texts(say(["this", "ring", "tracks", 300, "your", "sleep", "every", "night"]))).toEqual(["this ring tracks", "your sleep every night"]);
    expect(texts(say(["this", "ring", "tracks", 299, "your", "sleep"]))).toEqual(["this ring tracks your sleep"]);
  });
  it("never leaves a short word alone when it fits with a neighbour", () => {
    // "So" sits between a sentence end and a pause: it joins the words after it
    expect(texts(say(["it", "works.", "So", 400, "today", "we", "talk."]))).toEqual(["it works.", "So today we talk."]);
    // a trailing "it." joins the words before it
    expect(texts(say(["and", "that", "is", "all", "there", "is", "to", 400, "it."]))).toEqual(["and that is all there is to it."]);
    // a long neighbour it can't join: it stays alone
    expect(texts(say(["internationalisation.", "So.", 400, "extraordinary", "things"]), { maxChars: 12 })).toEqual(["internationalisation.", "So.", "extraordinary", "things"]);
  });
  it("never spans a cut", () => {
    const ws = say(["this", "ring", "tracks", "your", "sleep"]);
    expect(texts(ws, { cutsAt: [ws[1]!.endMs + 10] })).toEqual(["this ring", "tracks your sleep"]);
    // a short word next to a cut stays on its own side
    expect(texts(say(["it", "works", "so", "well"]), { cutsAt: [200 + 25] })).toEqual(["it", "works so well"]);
  });
  it("toTimeline breaks captions where the edit cuts", () => {
    const w = (id: string, text: string, s: number, e: number, struck = false) => ({ id, text, startMs: s, endMs: e, conf: 1, struck });
    const d = emptyEditDoc("p");
    d.clips = [{ id: "c1", mediaId: "m1", source: "camera", w: 1080, h: 1920, durationMs: 5000, fps: 30 }];
    d.beads = [{ id: "b1", clipId: "c1", inMs: 0, outMs: 2000, cuts: [], struck: false,
      words: [w("w1", "this", 0, 200), w("w2", "ring", 250, 450), w("w3", "um", 500, 800, true), w("w4", "tracks", 850, 1050), w("w5", "sleep.", 1100, 1300)] }];
    expect(toTimeline(EditDoc.parse(d)).captions.map((c) => c.text)).toEqual(["this ring", "tracks sleep."]);
  });
});

describe("captionBand", () => {
  it("9:16 keeps clear of the top 12% and bottom 22%, in the lower third by default", () => {
    const b = captionBand("9:16");
    expect(b.top).toBeGreaterThanOrEqual(0.12);
    expect(b.bottom).toBeLessThanOrEqual(0.78);
    expect((b.top + b.bottom) / 2).toBeGreaterThan(2 / 3 - 0.05);
  });
  it("moves off the face, keeping its centre 0.18 of the frame away, still inside the safe area", () => {
    for (const cy of [0, 0.2, 0.35, 0.45, 0.55, 0.6, 0.7, 0.8, 0.9, 1]) {
      const b = captionBand("9:16", cy);
      const c = (b.top + b.bottom) / 2;
      expect(b.top).toBeGreaterThanOrEqual(0.12);
      expect(b.bottom).toBeLessThanOrEqual(0.78);
      expect(Math.abs(c - cy)).toBeGreaterThanOrEqual(0.18 - 1e-9);
    }
    // a face high in frame doesn't move the captions; a low face pushes them above it
    expect(captionBand("9:16", 0.4)).toEqual(captionBand("9:16"));
    expect((captionBand("9:16", 0.65).top + captionBand("9:16", 0.65).bottom) / 2).toBeCloseTo(0.47, 5);
  });
  it("every aspect stays inside its frame; when nothing is clear of the face it goes as far from it as it can", () => {
    for (const a of ["9:16", "4:5", "1:1", "16:9"] as const) {
      for (const cy of [undefined, 0.1, 0.5, 0.9]) {
        const b = captionBand(a, cy);
        expect(b.top).toBeGreaterThan(0);
        expect(b.bottom).toBeLessThan(1);
        expect(b.bottom).toBeGreaterThan(b.top);
      }
    }
  });
});
