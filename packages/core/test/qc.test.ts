import { describe, expect, it } from "vitest";
import { addClipChange, applyChange, beadChanges, EditDoc, emptyEditDoc, toTimeline } from "../src";
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
    expect(issues[0]).toMatchObject({ code: "mid_word_cut", ours: true });
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

  it("flags a sliver that would flash by", () => {
    // leaves 2950–3000 ("a", 50 ms… padded to 150 ms) between two cuts
    const d = docWith([strike(2650, 2900), strike(3050, 3700)]);
    expect(codes(d)).toContain("flash_segment");
  });

  it("flags an edit with nothing left, as the person's to fix", () => {
    const d = docWith([]);
    const empty = EditDoc.parse({ ...d, beads: d.beads.map((b) => ({ ...b, struck: true })) });
    expect(qcDoc(empty)).toEqual([expect.objectContaining({ code: "empty", ours: false })]);
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
    expect(qcMedia(good({ audio: loud }), expectOk)).toEqual([expect.objectContaining({ code: "clipping", ours: true })]);
    expect(qcMedia(good({ audio: { ...loud, sourcePeakDb: 0 } }), expectOk)).toEqual([expect.objectContaining({ code: "clipping", ours: false, message: "the sound clips in the take itself" })]);
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
  const ours = { code: "black_frames" as const, atMs: 0, spanMs: 900, ours: true, message: "" };
  const theirs = { code: "clipping" as const, atMs: 0, spanMs: 900, ours: false, message: "" };
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
