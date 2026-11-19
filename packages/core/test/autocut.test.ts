import { describe, expect, it } from "vitest";
import { autocut, breath, parseJobOutput } from "../src";
import fixture from "./fixtures/autocut-cases.json";

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
    // the 1.5s pause before "you know" goes with it in one strike: no second, back-to-back pause strike
    expect(out.strikes.filter((s) => s.kind === "silence")).toEqual([]);
    const yk = out.strikes.find((s) => s.reason === "trimmed filler · 'you know'")!;
    expect([yk.startMs, yk.endMs]).toEqual([1900 + 140, 3800 - 80]);
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
    // Whisper base.en writes some "um"s as "Uhm," (owner QA, 19 Nov)
    const uhm = autocut({ words: [w("Uhm,", 0, 300), ...words.slice(1)], minSilenceMs: 450, fillers: [] });
    expect(uhm.strikes.map((s) => [s.kind, s.reason])).toContainEqual(["filler", "trimmed filler · 'uhm'"]);
    expect(out.beads.map((b) => [b.inMs, b.outMs])).toEqual([[0, 1600], [2600, 3500]]);
  });
  it("never treats a word across a sentence boundary as a repeat", () => {
    const words = [w("take", 0, 200), w("it.", 250, 400), w("It", 900, 1000), w("tracks", 1050, 1300)];
    const out = autocut({ words, minSilenceMs: 2000, fillers: [] });
    expect(out.strikes.filter((s) => s.kind === "repeat")).toEqual([]);
  });
});

// --- taste: last clean take, breath padding. Same cases as test_autocut.py, from the shared fixture file. ---
type Case = { name: string; input: { words: { text: string; startMs: number; endMs: number; conf: number }[]; minSilenceMs: number; fillers: string[] } };
const CASES = fixture.cases as (Case & { output: unknown })[];
const input = (name: string) => CASES.find((c) => c.name === name)!.input;
const strikes = (i: Case["input"]) => {
  const out = autocut(i);
  parseJobOutput("autocut", out);
  return out.strikes.map((s) => [s.startMs, s.endMs, s.kind, s.reason]);
};

describe("autocut taste (same cases as the python handler)", () => {
  it("matches the recorded output on every shared case (regenerate with `pnpm fixtures:autocut`)", () => {
    expect(CASES.length).toBeGreaterThan(60);
    for (const c of CASES) expect(autocut(c.input), c.name).toEqual(c.output);
  });

  it("keeps the last take of a false start", () => {
    expect(strikes(input("false start after a pause"))).toEqual([[0, 850, "repeat", "kept your last take · 'so today we'"]]);
    expect(strikes(input("false start ending in a cut-off word"))).toEqual([[0, 550, "repeat", "kept your last take · 'so we'"]]);
    expect(strikes(input("false start with a filler between"))).toEqual([
      [0, 600, "repeat", "kept your last take · 'i think'"], [600, 850, "filler", "trimmed filler · 'um'"]]);
    expect(strikes(input("false start chain keeps the last")).map((s) => s[3])).toEqual(Array(2).fill("kept your last take · 'so today'"));
  });

  it("never cuts deliberate repetition", () => {
    for (const name of ["rhetorical repeat without a pause", "rhetorical repeat that ends the sentence", "never never give up", "i came i saw", "bye bye",
      "so so good", "a finished sentence is not a false start", "anaphora is not a retake", "short emphatic repeat is not a retake",
      "a changed word is not a repeat", "parallel sentences are not a retake", "a retake that swaps a word is left alone",
      "shower and pool are two things", "try it and buy it are two things"]) {
      // not a word struck (a long pause between the sentences may still be trimmed)
      expect(strikes(input(name)).filter((s) => s[2] !== "silence"), name).toEqual([]);
    }
  });

  it("a full retake strikes the earlier sentence whole; three takes keep the last", () => {
    expect(strikes(input("full retake"))).toEqual([[0, 3070, "repeat", "kept your last take · 'so today we're going to talk…'"]]);
    expect(strikes(input("three takes keep the last")).map((s) => [s[0], s[1]])).toEqual([[0, 2150], [2150, 4720]]);
    // the hook is the take that's kept, not the flubbed one
    expect(autocut(input("three takes keep the last")).beads.map((b) => b.moment)).toEqual([undefined, undefined, "hook"]);
    expect(strikes(input("a retake cut off mid-word"))).toEqual([[0, 2070, "repeat", "kept your last take · 'this ring tracks your sl'"]]);
    // containment: the later take may add words, never swap them
    expect(strikes(input("a retake that adds words")).filter((s) => s[2] === "repeat")).toEqual([[0, 1670, "repeat", "kept your last take · 'i love this ring'"]]);
    expect(strikes(input("the same sentence said twice")).filter((s) => s[2] === "repeat")).toEqual([[0, 1670, "repeat", "kept your last take · 'this ring is amazing'"]]);
  });

  it("pads cuts with a breath and merges a filler with the pauses around it", () => {
    expect(breath(1000)).toEqual({ tail: 140, lead: 80 });
    expect(breath(200)).toEqual({ tail: 90, lead: 80 });
    expect(strikes(input("pause between kept words"))).toEqual([[390, 1170, "silence", "trimmed pause · 1.0s"]]);
    expect(strikes(input("short pause keeps 45% each side at most"))).toEqual([[340, 370, "silence", "trimmed pause · 0.2s"]]);
    expect(strikes(input("filler swallows the pauses around it"))).toEqual([[390, 1220, "filler", "trimmed filler · 'um'"]]);
    expect(strikes(input("filler in tight speech is cut on its word"))).toEqual([[300, 550, "filler", "trimmed filler · 'um'"]]);
    expect(strikes(input("two fillers in a row"))).toEqual([
      [390, 1100, "filler", "trimmed filler · 'um'"], [1100, 1770, "filler", "trimmed filler · 'uh'"]]);
  });

  it("no strike ever reaches into a kept word", () => {
    for (const c of CASES) {
      const { words } = c.input;
      const out = autocut(c.input).strikes;
      const struck = new Set(words.flatMap((w, k) => (out.some((s) => s.kind !== "silence" && s.startMs <= w.startMs && w.endMs <= s.endMs) ? [k] : [])));
      words.forEach((w, k) => {
        if (struck.has(k)) return;
        for (const s of out) expect(s.startMs < w.endMs && w.startMs < s.endMs, `${c.name}: ${w.text}@${w.startMs}`).toBe(false);
      });
      for (const s of out) expect(s.endMs).toBeGreaterThan(s.startMs);
    }
  });
});
