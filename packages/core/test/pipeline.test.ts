import { describe, expect, it } from "vitest";
import { addClipChange, applyChange, autocut as runAutocut, beadChanges, cutdownChange, EditDoc, emptyEditDoc, keptMs, toTimeline } from "../src";

const word = (text: string, s: number, e: number, conf = 0.9) => ({ text, startMs: s, endMs: e, conf });
const transcript = {
  language: "en",
  durationMs: 9000,
  words: [
    word("Um,", 0, 300), word("this", 400, 600), word("ring", 650, 900), word("tracks", 950, 1200), word("my", 1250, 1400), word("sleep.", 1450, 1800),
    word("It", 3300, 3400), word("it", 3450, 3550), word("lasts", 3600, 3900), word("a", 3950, 4000), word("whole", 4050, 4300), word("week.", 4350, 4700, 0.99),
    word("Link", 5000, 5300), word("below.", 5350, 5800),
  ],
};
const autocut = {
  strikes: [
    { startMs: 0, endMs: 300, kind: "filler" as const, reason: "trimmed filler · 'um'" },
    { startMs: 1920, endMs: 3180, kind: "silence" as const, reason: "trimmed pause · 1.5s" },
    { startMs: 3450, endMs: 3550, kind: "repeat" as const, reason: "trimmed repeat · 'it'" },
  ],
  beads: [{ inMs: 0, outMs: 1800, moment: "hook" as const }, { inMs: 1800, outMs: 4700 }, { inMs: 5000, outMs: 5800, moment: "cta" as const }],
};

function run(doc: EditDoc, changes: ReturnType<typeof beadChanges>) {
  for (const c of changes) doc = applyChange(doc, c)!.doc;
  return doc;
}

describe("pipeline changes", () => {
  it("builds beads, strikes and moments, each with its own reason, without deleting words", () => {
    let doc = applyChange(emptyEditDoc("p"), addClipChange({ id: "c1", mediaId: "m1", source: "upload", w: 640, h: 360, durationMs: 9000, fps: 15 }))!.doc;
    const changes = beadChanges(doc, "c1", transcript, autocut);
    expect(changes.map((c) => c.reason)).toEqual([
      "split into 3 beads · at sentences",
      "trimmed filler · 'um'",
      "trimmed pause · 1.5s",
      "trimmed repeat · 'it'",
      "hook · your opening line",
      "call to action · your closing line",
      "best line · clearest delivery",
    ]);
    doc = run(doc, changes);
    expect(doc.beads).toHaveLength(3);
    expect(doc.beads.flatMap((b) => b.words).map((w) => w.text).join(" ")).toContain("Um, this ring"); // nothing deleted
    expect(doc.beads[0]!.words[0]).toMatchObject({ struck: true, strikeKind: "filler" });
    expect(doc.beads[1]!.cuts[0]).toMatchObject({ struck: true, kind: "silence" });
    expect(doc.beads.map((b) => b.moment)).toEqual(["hook", "best", "cta"]);
    expect(doc.pins).toEqual([]); // autopilot changes never pin
  });

  it("cutdown keeps the hook and call to action", () => {
    let doc = applyChange(emptyEditDoc("p"), addClipChange({ id: "c1", mediaId: "m1", source: "upload", w: 640, h: 360, durationMs: 9000, fps: 15 }))!.doc;
    doc = run(doc, beadChanges(doc, "c1", transcript, autocut));
    const total = doc.beads.reduce((a, b) => a + keptMs(b), 0);
    const c = cutdownChange(doc, 2500)!;
    expect(c.reason).toMatch(/^cutdown · 3s/);
    const out = applyChange(doc, c)!.doc;
    expect(out.beads.filter((b) => !b.struck).map((b) => b.moment)).toEqual(["hook", "cta"]);
    expect(cutdownChange(doc, total + 1)).toBeNull();
  });
});

import { isSpellingFix } from "../src";
describe("captions keep the speaker's words", () => {
  it("allows spelling, casing and punctuation fixes, not new words", () => {
    expect(isSpellingFix("ring", "Ring.")).toBe(true);
    expect(isSpellingFix("recieve", "receive")).toBe(true);
    expect(isSpellingFix("nightstand", "night-stand")).toBe(true);
    expect(isSpellingFix("love", "hate")).toBe(false);
    expect(isSpellingFix("week", "month")).toBe(false);
    expect(isSpellingFix("it", "")).toBe(false);
  });
});

import { retakeChanges } from "../src";
describe("teleprompter retakes", () => {
  it("keeps the last take of each line and strikes earlier ones", () => {
    const mk = (id: string, text: string) => ({ id, clipId: "c1", inMs: 0, outMs: 1, cuts: [], struck: false, words: text.split(" ").map((t, i) => ({ id: `${id}w${i}`, text: t, startMs: 0, endMs: 1, conf: 1, struck: false })) });
    const doc = EditDoc.parse({
      ...emptyEditDoc("p"),
      script: ["this ring tracks my sleep", "link below"],
      beads: [mk("b1", "this ring tracks my uh"), mk("b2", "this ring tracks my sleep."), mk("b3", "something else entirely"), mk("b4", "link below.")],
    });
    const changes = retakeChanges(doc);
    expect(changes).toHaveLength(1);
    expect(changes[0]!.reason).toBe("retake · kept your last take of line 1");
    expect(changes[0]!.ops.map((o) => o.path)).toEqual(["/beads/@b1/struck"]);
  });
});

describe("pauses between sentences", () => {
  it("are kept inside the bead before them, so a struck pause is recorded and restorable", () => {
    let doc = applyChange(emptyEditDoc("p"), addClipChange({ id: "c1", mediaId: "m1", source: "upload", w: 640, h: 360, durationMs: 9000, fps: 15 }))!.doc;
    const gapCut = {
      strikes: [{ startMs: 1920, endMs: 3180, kind: "silence" as const, reason: "trimmed pause · 1.5s" }],
      beads: [{ inMs: 0, outMs: 1800 }, { inMs: 3300, outMs: 4700 }],
    };
    doc = run(doc, beadChanges(doc, "c1", transcript, gapCut));
    expect(doc.beads[0]!.outMs).toBe(3300); // tiles up to the next sentence
    expect(doc.beads[0]!.cuts).toHaveLength(1);
    expect(doc.beads[0]!.cuts[0]).toMatchObject({ startMs: 1920, endMs: 3180, struck: true });
  });
});

describe("real autocut → edit → timeline", () => {
  const edit = (words: ReturnType<typeof word>[], fillers: string[]) => {
    const t = { language: "en", durationMs: 20000, words };
    const d = applyChange(emptyEditDoc("p"), addClipChange({ id: "c1", mediaId: "m1", source: "upload", w: 640, h: 360, durationMs: 20000, fps: 15 }))!.doc;
    return run(d, beadChanges(d, "c1", t, runAutocut({ words, minSilenceMs: 450, fillers })));
  };
  /** source ranges the edit leaves out */
  const removed = (d: EditDoc) => {
    const segs = toTimeline(d).segments;
    return segs.slice(1).map((s, i) => [segs[i]!.toMs, s.fromMs]).filter(([a, b]) => b! > a!);
  };

  it("a filler after a sentence takes the pause before it across the bead edge: one removal", () => {
    const words = [word("this", 400, 600), word("ring", 650, 900), word("tracks", 950, 1200), word("sleep.", 1550, 1900),
      word("you", 3400, 3500), word("know", 3520, 3700), word("link", 3800, 4000), word("below.", 4050, 4400)];
    const d = edit(words, ["you know"]);
    expect(d.beads.flatMap((b) => b.words).filter((w) => w.struck).map((w) => w.text)).toEqual(["you", "know"]);
    // the 20ms left after "know" is under a frame: no cut for it
    expect(removed(d)).toEqual([[1900 + 140, 3700]]);
  });

  it("a struck retake leaves no slivers of air: the earlier sentence and the pause after it go in one piece", () => {
    const take = (t0: number, extra: string[]) => ["so", "today", "we're", "going", "to", "talk", "about", ...extra].map((x, i) => word(x, t0 + i * 300, t0 + i * 300 + 250));
    const a = take(0, ["rings."]);
    const b = take(a.at(-1)!.endMs + 900, ["sleep", "rings."]);
    const d = edit([...a, ...b], []);
    expect(d.beads[0]!.words.every((w) => w.struck && w.strikeKind === "repeat")).toBe(true);
    expect(d.beads[1]!.words.some((w) => w.struck)).toBe(false);
    expect(d.beads.map((x) => x.moment)).toEqual([undefined, "hook"]); // the hook is the take that is kept
    const segs = toTimeline(d).segments;
    expect(removed(d)).toEqual([]); // one continuous stretch of footage (two beads, no gap)
    expect([segs[0]!.fromMs, segs.at(-1)!.toMs]).toEqual([b[0]!.startMs - 80, b.at(-1)!.endMs]);
  });
});
