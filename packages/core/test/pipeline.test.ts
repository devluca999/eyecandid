import { describe, expect, it } from "vitest";
import { addClipChange, applyChange, beadChanges, cutdownChange, emptyEditDoc, keptMs, type EditDoc } from "../src";

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
