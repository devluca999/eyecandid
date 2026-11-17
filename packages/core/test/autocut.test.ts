import { describe, expect, it } from "vitest";
import { autocut, parseJobOutput } from "../src";

// Same cases as services/engine/tests/test_autocut.py — the two engines must cut identically.
const w = (text: string, startMs: number, endMs: number) => ({ text, startMs, endMs, conf: 1 });
const WORDS = [
  w("um", 0, 300), w("this", 400, 600), w("ring", 650, 900), w("ring", 950, 1200), w("tracks", 1250, 1500),
  w("sleep.", 1550, 1900), w("you", 3400, 3500), w("know", 3520, 3700), w("link", 3800, 4000), w("below.", 4050, 4400),
];

describe("autocut (browser twin of the python handler)", () => {
  it("strikes fillers, repeats and pauses without changing words", () => {
    const out = autocut({ words: WORDS, minSilenceMs: 450, fillers: ["um", "you know"] });
    parseJobOutput("autocut", out);
    const kinds = out.strikes.map((s) => [s.kind, s.reason]);
    expect(kinds).toContainEqual(["filler", "trimmed filler · 'um'"]);
    expect(kinds).toContainEqual(["filler", "trimmed filler · 'you know'"]);
    expect(kinds).toContainEqual(["repeat", "trimmed repeat · 'ring'"]);
    expect(out.strikes.some((s) => s.kind === "silence" && s.reason.startsWith("trimmed pause · 1.5s"))).toBe(true);
  });
  it("splits beads at sentences with hook and cta", () => {
    const out = autocut({ words: WORDS, minSilenceMs: 450, fillers: [] });
    expect(out.beads.map((b) => [b.inMs, b.outMs])).toEqual([[0, 1900], [3400, 4400]]);
    expect(out.beads[0]!.moment).toBe("hook");
    expect(out.beads.at(-1)!.moment).toBe("cta");
  });
  it("catches filler spelling variants and splits at pauses without punctuation", () => {
    const words = [w("UMM,", 0, 300), w("this", 400, 600), w("ring", 650, 900), w("tracks", 950, 1200), w("sleep", 1250, 1600),
      w("it", 2600, 2700), w("lasts", 2750, 3000), w("a", 3050, 3100), w("week", 3150, 3500)];
    const out = autocut({ words, minSilenceMs: 450, fillers: [] });
    expect(out.strikes.map((s) => [s.kind, s.reason])).toContainEqual(["filler", "trimmed filler · 'umm'"]);
    expect(out.beads.map((b) => [b.inMs, b.outMs])).toEqual([[0, 1600], [2600, 3500]]);
  });
  it("never treats a word across a sentence boundary as a repeat", () => {
    const words = [w("take", 0, 200), w("it.", 250, 400), w("It", 900, 1000), w("tracks", 1050, 1300)];
    const out = autocut({ words, minSilenceMs: 2000, fillers: [] });
    expect(out.strikes.filter((s) => s.kind === "repeat")).toEqual([]);
  });
});
