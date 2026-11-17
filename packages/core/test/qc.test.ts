import { describe, expect, it } from "vitest";
import { addClipChange, applyChange, autocut, beadChanges, EditDoc, emptyEditDoc, toTimeline } from "../src";
import { QC, qcDoc, qcMedia, qcVerdict, type MediaStats } from "../src/qc";

const word = (text: string, s: number, e: number) => ({ text, startMs: s, endMs: e, conf: 0.9 });
const transcript = {
  language: "en",
  durationMs: 9000,
  words: [
    word("Um,", 0, 300), word("this", 400, 600), word("ring", 900, 1100), word("tracks", 1150, 1400), word("sleep.", 1450, 1800),
    word("It", 2500, 2600), word("lasts", 2650, 2900), word("a", 2950, 3000), word("whole", 3050, 3300), word("week.", 3350, 3700),
    word("Link", 5200, 5500), word("below.", 5550, 6000),
  ],
};
const beads = [{ inMs: 0, outMs: 1800, moment: "hook" as const }, { inMs: 2500, outMs: 3700 }, { inMs: 5200, outMs: 6000, moment: "cta" as const }];
const strike = (startMs: number, endMs: number, kind: "filler" | "silence" = "silence") => ({ startMs, endMs, kind, reason: "trimmed pause · 0.5s" });

function docWith(strikes: ReturnType<typeof strike>[]): EditDoc {
  let doc = applyChange(emptyEditDoc("p"), addClipChange({ id: "c1", mediaId: "m1", source: "upload", w: 640, h: 360, durationMs: 9000, fps: 30 }))!.doc;
  for (const c of beadChanges(doc, "c1", transcript, { strikes, beads })) doc = applyChange(doc, c)!.doc;
  return EditDoc.parse(doc);
}
const codes = (d: EditDoc) => qcDoc(d).map((i) => i.code);

describe("qcDoc", () => {
  it("passes a normal autocut edit", () => {
    expect(qcDoc(docWith([strike(0, 300, "filler")]))).toEqual([]);
  });

  it("flags a cut that lands inside a kept word, naming the word and the time", () => {
    // a pause cut that runs 100 ms into "ring" (900–1100)
    const issues = qcDoc(docWith([strike(700, 1000)]));
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ code: "mid_word_cut", ours: true, gate: "block" });
    expect(issues[0]!.message).toBe("a cut at 0:00 lands inside 'ring'");
  });

  it("allows a cut within the tolerance of a word's edge (ASR edges are soft)", () => {
    expect(codes(docWith([strike(700, 900 + QC.wordEdgeToleranceMs)]))).toEqual([]);
  });

  it("doesn't treat the start and end of the edit as cuts", () => {
    const d = docWith([]);
    expect(toTimeline(d).segments.length).toBeGreaterThan(1);
    expect(codes(d)).toEqual([]);
  });

  it("flags a fragment that would flash by, but not a short piece that holds a whole word", () => {
    // 3160–3260 is 100 ms from the middle of "whole" (3050–3300): a fragment
    const frag = qcDoc(docWith([strike(2960, 3160), strike(3260, 3340)])).filter((i) => i.code === "flash_segment");
    expect(frag).toEqual([expect.objectContaining({ gate: "note" })]);
    expect(qcVerdict(frag).ok).toBe(true); // noted for tuning the cut, never a reason to refuse an export
    // 2905–3045 holds the whole word "a" (2950–3000): ordinary speech between two cuts
    expect(codes(docWith([strike(2640, 2905), strike(3045, 3340)]))).not.toContain("flash_segment");
  });

  it("a mid-word cut the person placed themselves is theirs to keep", () => {
    const d = docWith([strike(700, 1000)]);
    const bead = d.beads.find((b) => b.cuts.length)!;
    const cut = bead.cuts[0]!;
    // the person drags the cut's end: a user change pins it
    const mine = EditDoc.parse(applyChange(d, { actor: "user", reason: "moved a cut", ops: [{ op: "set", path: `/beads/@${bead.id}/cuts/@${cut.id}/endMs`, value: 1010 }] })!.doc);
    const issues = qcDoc(mine);
    expect(issues).toEqual([expect.objectContaining({ code: "mid_word_cut", ours: false, gate: "ask" })]);
    expect(qcVerdict(issues).ok).toBe(false);
    expect(qcVerdict(issues, true).ok).toBe(true);
  });

  it("flags an edit with nothing left, as the person's to fix", () => {
    const d = docWith([]);
    const empty = EditDoc.parse({ ...d, beads: d.beads.map((b) => ({ ...b, struck: true })) });
    expect(qcDoc(empty)).toEqual([expect.objectContaining({ code: "empty", ours: false, gate: "block" })]);
    expect(qcVerdict(qcDoc(empty), true).ok).toBe(false); // "export anyway" never delivers an empty file
  });

  it("flags a caption that cannot fit two lines", () => {
    const d = docWith([]);
    expect(qcDoc(d, { captionMaxChars: 10 }).some((i) => i.code === "caption_overflow")).toBe(true);
    expect(qcDoc(d).some((i) => i.code === "caption_overflow")).toBe(false);
  });
});

const good = (over: Partial<MediaStats> = {}): MediaStats => ({
  durationMs: 10_000,
  sampleEveryMs: 100,
  luma: Array(100).fill(0.4),
  diff: [0, ...Array(99).fill(0.01)],
  audio: { peakDb: -1.2, clippedRatio: 0, rmsDb: -18 },
  ...over,
});
const expectOk = { durationMs: 10_000, hasSpeech: true };
const fill = (base: number[], from: number, n: number, v: number) => base.map((x, i) => (i >= from && i < from + n ? v : x));

describe("qcMedia", () => {
  it("passes a healthy export", () => {
    expect(qcMedia(good(), expectOk)).toEqual([]);
  });

  it("flags more than half a second of black, with where it starts", () => {
    const s = good({ luma: fill(good().luma, 120 / 10, 8, 0.005) });
    expect(qcMedia(s, expectOk)).toEqual([expect.objectContaining({ code: "black_frames", atMs: 1200, spanMs: 800, ours: true, message: "the picture goes black at 0:01" })]);
  });

  it("ignores a short dip to black (a blink, a cut)", () => {
    expect(qcMedia(good({ luma: fill(good().luma, 12, 4, 0.005) }), expectOk)).toEqual([]);
  });

  it("doesn't blame the export for a take that is dark there too", () => {
    const luma = fill(good().luma, 12, 8, 0.005);
    expect(qcMedia(good({ luma, sourceLuma: luma }), expectOk)).toEqual([]);
  });

  it("flags a freeze of more than a second where the take moved", () => {
    const diff = fill(good().diff, 30, 15, 0);
    expect(qcMedia(good({ diff }), expectOk)).toEqual([expect.objectContaining({ code: "frozen_frames", atMs: 3000, spanMs: 1500, ours: true })]);
    expect(qcMedia(good({ diff, sourceDiff: diff }), expectOk)).toEqual([]); // a locked-off shot of someone holding still
  });

  it("an export that is one still frame from the start is frozen", () => {
    expect(qcMedia(good({ diff: Array(100).fill(0) }), expectOk).map((i) => i.code)).toEqual(["frozen_frames"]);
  });

  it("clipping is ours when only the export clips, the footage's when the take already did", () => {
    const loud = { peakDb: 0, clippedRatio: 0.01, rmsDb: -9 };
    expect(qcMedia(good({ audio: loud }), expectOk)).toEqual([expect.objectContaining({ code: "clipping", ours: true, gate: "block" })]);
    expect(qcMedia(good({ audio: { ...loud, sourcePeakDb: 0 } }), expectOk)).toEqual([expect.objectContaining({ code: "clipping", ours: false, gate: "ask", message: "the sound clips in the take itself" })]);
  });

  it("flags a silent export of an edit that has speech, and a missing audio track", () => {
    expect(qcMedia(good({ audio: { peakDb: -80, clippedRatio: 0, rmsDb: -80 } }), expectOk).map((i) => i.code)).toEqual(["silent"]);
    expect(qcMedia(good({ audio: undefined }), expectOk).map((i) => i.code)).toEqual(["silent"]);
    expect(qcMedia(good({ audio: undefined }), { ...expectOk, hasSpeech: false })).toEqual([]);
  });

  it("flags an export whose length is not the edit's", () => {
    expect(qcMedia(good({ durationMs: 9_000 }), expectOk).map((i) => i.code)).toContain("wrong_length");
    expect(qcMedia(good({ durationMs: 10_150 }), expectOk)).toEqual([]);
  });
});

describe("qcVerdict", () => {
  const ours = { code: "black_frames" as const, atMs: 0, spanMs: 900, ours: true, gate: "block" as const, message: "" };
  const theirs = { code: "clipping" as const, atMs: 0, spanMs: 900, ours: false, gate: "ask" as const, message: "" };
  it("delivers a clean export", () => {
    expect(qcVerdict([])).toEqual({ ok: true, blocking: [], overridable: [] });
  });
  it("never delivers our own fault, even if the person accepts", () => {
    expect(qcVerdict([ours], true).ok).toBe(false);
    expect(qcVerdict([ours, theirs], true)).toMatchObject({ ok: false, blocking: [ours], overridable: [theirs] });
  });
  it("lets the person export anyway when the problem is in their footage", () => {
    expect(qcVerdict([theirs]).ok).toBe(false);
    expect(qcVerdict([theirs], true).ok).toBe(true);
  });
});

// Ordinary takes must pass: if the check flags plain autocut output, the check is wrong.
describe("qcDoc on ordinary autocut output", () => {
  // a small deterministic generator of talking takes: short and long words, fillers, stutters, pauses of every length
  function take(seed: number) {
    let x = seed * 2654435761 % 4294967296;
    const rnd = () => ((x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296);
    const pick = <T,>(a: T[]) => a[Math.floor(rnd() * a.length)]!;
    const vocab = ["I", "a", "so", "this", "ring", "tracks", "sleep", "honestly", "it", "lasts", "week", "um", "uh", "like", "you", "know", "really", "love", "the", "battery", "is", "great", "basically", "link", "below"];
    const words: { text: string; startMs: number; endMs: number; conf: number }[] = [];
    let t = Math.floor(rnd() * 400);
    const n = 25 + Math.floor(rnd() * 60);
    for (let i = 0; i < n; i++) {
      let text = rnd() < 0.08 && words.length ? words.at(-1)!.text.replace(/[.,]$/, "") : pick(vocab);
      if (rnd() < 0.15) text += ".";
      else if (rnd() < 0.1) text += ",";
      const len = 50 + Math.floor(rnd() * (text.length * 70));
      words.push({ text, startMs: t, endMs: t + len, conf: 0.9 });
      t += len + pick([0, 20, 40, 80, 120, 200, 300, 449, 450, 460, 700, 1500]);
    }
    return { language: "en", durationMs: t + 300, words };
  }

  it("never blocks or questions one of 300 generated takes", () => {
    const bad: string[] = [];
    let slivers = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const tr = take(seed);
      let doc = applyChange(emptyEditDoc("p"), addClipChange({ id: "c1", mediaId: "m1", source: "upload", w: 640, h: 360, durationMs: tr.durationMs, fps: 30 }))!.doc;
      for (const c of beadChanges(doc, "c1", tr, autocut({ words: tr.words }))) doc = applyChange(doc, c)?.doc ?? doc;
      const issues = qcDoc(EditDoc.parse(doc)).filter((i) => i.code !== "empty");
      slivers += issues.filter((i) => i.gate === "note").length;
      for (const i of issues) if (i.gate !== "note") bad.push(`seed ${seed}: ${i.code} · ${i.message}`);
    }
    expect(bad.slice(0, 10)).toEqual([]);
    // today's autocut does leave wordless slivers between back-to-back cuts, and the chunker a few long captions
    expect(slivers).toBeGreaterThan(0);
    console.log(`qc: ${slivers} notes (wordless slivers, captions past two lines) across 300 generated takes`);
  });
});
