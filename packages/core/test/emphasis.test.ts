import { describe, expect, it } from "vitest";
import {
  addClipChange, applyChange, autocut, beadChanges, dialChanges, EditDoc, emphasisWords, emptyEditDoc, JOB_SPECS, punchAt, toTimeline, withDials, wordRms,
  EMPHASIS_PREFIX, type DialValues,
} from "../src";

/** ~16 s of talk, a word every 400 ms; a few are said harder */
const LOUD: Record<string, number> = { never: 2.4, every: 1.9, totally: 2.1, long: 1.8, um: 3, it: 3 };
const TEXT = "i have never once taken this ring off every night it is on me and it is totally fine with water um so it works for it all day long you know what i mean right here".split(" ");
const transcript: { language: string; durationMs: number; words: { text: string; startMs: number; endMs: number; conf: number; rms?: number }[] } = {
  language: "en",
  durationMs: TEXT.length * 400 + 400,
  words: TEXT.map((t, i) => ({ text: i === TEXT.length - 1 ? t + "." : t, startMs: i * 400, endMs: i * 400 + 300, conf: 0.9, rms: LOUD[t] ?? 1 })),
};

function fresh(t = transcript): EditDoc {
  let doc = applyChange(emptyEditDoc("p"), addClipChange({ id: "c1", mediaId: "m1", source: "upload", w: 1080, h: 1920, durationMs: t.durationMs, fps: 30 }))!.doc;
  for (const c of beadChanges(doc, "c1", t, autocut({ words: t.words }))) doc = applyChange(doc, c)!.doc;
  return doc;
}
const D = (energy: number): DialValues => ({ pace: 0.5, brollDensity: 0.3, energy });
function run(doc: EditDoc, dials: DialValues) {
  for (const c of dialChanges(doc, dials)) doc = EditDoc.parse(applyChange(doc, c)?.doc ?? doc);
  return doc;
}
const words = (d: EditDoc) => d.beads.flatMap((b) => b.words);
const wordOf = (d: EditDoc, text: string) => words(d).find((w) => w.text === text)!;

describe("per-word loudness", () => {
  it("wordRms: relative to the take's median word", () => {
    const sr = 16000;
    const x = new Float32Array(sr * 3);
    for (let i = 0; i < x.length; i++) x[i] = (i >= sr && i < 2 * sr ? 0.4 : 0.1) * Math.sin(i / 3);
    const r = wordRms(x, sr, [{ startMs: 0, endMs: 500 }, { startMs: 1200, endMs: 1700 }, { startMs: 2200, endMs: 2700 }, { startMs: 5000, endMs: 5200 }]);
    expect(r[0]).toBe(1);
    expect(r[1]).toBeCloseTo(4, 1);
    expect(r[2]).toBe(1);
    expect(r[3]).toBe(0); // past the audio
    expect(wordRms(new Float32Array(100), sr, [{ startMs: 0, endMs: 5 }])).toEqual([0]);
  });

  it("the contract carries rms optionally, and the doc keeps it", () => {
    expect(JOB_SPECS.transcribe.output.parse(transcript).words[2]!.rms).toBe(2.4);
    const old = { ...transcript, words: transcript.words.map(({ rms: _r, ...w }) => w) };
    expect(JOB_SPECS.transcribe.output.parse(old).words[2]!.rms).toBeUndefined();
    expect(wordOf(fresh(), "never").rms).toBe(2.4);
    expect(wordOf(fresh(old), "never").rms).toBeUndefined();
  });
});

describe("emphasis punch-ins (energy dial)", () => {
  it("none at energy 0.5 and below", () => {
    expect(emphasisWords(fresh(), 0.5)).toEqual([]);
    expect(dialChanges(fresh(), D(0.5))).toEqual([]);
  });

  it("at full energy: the loud real words, at least 4 s apart, loudest first; fillers and short words never", () => {
    const picks = emphasisWords(fresh(), 1).map((e) => e.word.text);
    // "every" (1.9) is only 2.4 s after "never" (2.4): dropped; "um" and "it" are loud but never picked
    expect(picks).toEqual(["never", "totally", "long"]);
    const out = emphasisWords(fresh(), 1).map((e) => e.outMs);
    for (let i = 1; i < out.length; i++) expect(out[i]! - out[i - 1]!).toBeGreaterThanOrEqual(4000);
  });

  it("lower energy spaces them further (8 s just above 0.5)", () => {
    expect(emphasisWords(fresh(), 0.55).map((e) => e.word.text)).toEqual(["never", "long"]); // "totally" is 6 s from "never"
  });

  it("each is one explained change in the doc, owned by the dial", () => {
    const changes = dialChanges(fresh(), D(1));
    const reasons = changes.map((c) => c.reason);
    expect(reasons).toContain("punched in on 'never' · you leaned on it");
    expect(reasons).toContain("punched in on 'totally' · you leaned on it");
    const d = run(fresh(), D(1));
    const fx = d.effects.filter((f) => f.id.startsWith(EMPHASIS_PREFIX));
    expect(fx.map((f) => f.anchor)).toEqual([{ wordId: wordOf(d, "never").id }, { wordId: wordOf(d, "totally").id }, { wordId: wordOf(d, "long").id }]);
    expect(fx.every((f) => f.params.span === "word" && f.params.scale === 1.08)).toBe(true);
  });

  it("idempotent, reversible, and the preview overlay matches", () => {
    const d = run(fresh(), D(1));
    expect(dialChanges(d, D(1))).toEqual([]);
    const back = run(d, D(0.5));
    expect(back.effects).toEqual([]);
    expect(withDials(fresh(), D(1)).effects.map((f) => f.id)).toEqual(d.effects.map((f) => f.id));
  });

  it("a pinned emphasis punch-in is never moved or removed by the dial", () => {
    let d = run(fresh(), D(1));
    const id = EMPHASIS_PREFIX + wordOf(d, "never").id;
    d = EditDoc.parse(applyChange(d, { actor: "user", reason: "kept · my call", ops: [{ op: "set", path: `/effects/@${id}/params/scale`, value: 1.2 }] })!.doc);
    const after = run(d, D(0.5));
    expect(after.effects.find((f) => f.id === id)?.params.scale).toBe(1.2);
  });

  it("the punch pushes further on the word and holds a beat, on top of the bead's own punch", () => {
    const d = run(fresh(), D(1));
    const never = wordOf(d, "never");
    const before = punchAt(d, "c1", never.startMs - 300);
    const on = punchAt(d, "c1", never.startMs + 100);
    expect(on / before).toBeCloseTo(1.08, 5);
    expect(punchAt(d, "c1", never.endMs + 1100)).toBeCloseTo(on, 5); // held
    expect(punchAt(d, "c1", never.endMs + 1300)).toBeCloseTo(before, 5); // released
  });

  it("without rms the energy dial does exactly what it did before", () => {
    const old = { ...transcript, words: transcript.words.map(({ rms: _r, ...w }) => w) };
    const d = run(fresh(old), D(1));
    expect(d.effects.some((f) => f.id.startsWith(EMPHASIS_PREFIX))).toBe(false);
    expect(d.effects.length).toBeGreaterThan(0); // the bead punch-ins are still there
  });

  it("a struck word is never emphasised", () => {
    let d = fresh();
    const never = wordOf(d, "never");
    const bead = d.beads.find((b) => b.words.includes(never))!;
    d = EditDoc.parse(applyChange(d, { actor: "user", reason: "cut · my call", ops: [{ op: "set", path: `/beads/@${bead.id}/words/@${never.id}/struck`, value: true }] })!.doc);
    expect(emphasisWords(d, 1).map((e) => e.word.text)).not.toContain("never");
    expect(toTimeline(d).durationMs).toBeLessThan(toTimeline(fresh()).durationMs);
  });
});
