import { describe, expect, it } from "vitest";
import { addClipChange, applyChange, autocut, beadChanges, cutdownChange, EditDoc, emptyEditDoc, reframeChange, toTimeline, type Aspect, type RenderMeasure } from "../src";
import { qcDoc, qcVerdict } from "../src/qc";
import { qcAction, qcAutoFix, qcExport, statsFromMeasure } from "../src/qcGate";

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

function docWith(strikes: ReturnType<typeof strike>[], over: { w?: number; h?: number } = {}): EditDoc {
  let doc = applyChange(emptyEditDoc("p"), addClipChange({ id: "c1", mediaId: "m1", source: "upload", w: over.w ?? 640, h: over.h ?? 360, durationMs: 9000, fps: 30 }))!.doc;
  for (const c of beadChanges(doc, "c1", transcript, { strikes, beads })) doc = applyChange(doc, c)!.doc;
  return EditDoc.parse(doc);
}
const withFace = (d: EditDoc, cy: number) => EditDoc.parse(applyChange(d, reframeChange("c1", [{ ms: 0, cx: 0.5, cy, scale: 1 }], 1))!.doc);

describe("qcAutoFix: cuts inside a word", () => {
  it("moves a cut that ends inside a word back to the word's start, with the breath autocut keeps, and explains it", () => {
    // a pause cut that runs 100 ms into "ring" (900–1100); "this" ends at 600, so 80 ms of breath is kept before "ring"
    const d = docWith([strike(700, 1000)]);
    expect(qcDoc(d).map((i) => i.code)).toEqual(["mid_word_cut"]);
    const r = qcAutoFix(d);
    expect(r.issues).toEqual([]);
    expect(r.changes).toHaveLength(1);
    expect(r.changes[0]).toMatchObject({ actor: "autopilot:qc", reason: "cut moved to a word boundary · keeps 'ring' whole" });
    const cut = r.doc.beads.flatMap((b) => b.cuts).find((c) => c.struck)!;
    expect(cut).toMatchObject({ startMs: 700, endMs: 820 });
  });

  it("moves a cut that starts inside a word to after it, never taking more of what was said", () => {
    // starts inside "lasts" (2650–2900); "a" starts at 2950, so the breath after is capped at 45% of the 50 ms gap
    const d = docWith([strike(2800, 2945)]);
    const r = qcAutoFix(d);
    expect(r.issues).toEqual([]);
    const cut = r.doc.beads.flatMap((b) => b.cuts).find((c) => c.struck)!;
    expect(cut.startMs).toBe(2900 + 22);
    // every word that played still plays, and the clipped one now plays whole
    const kept = (x: EditDoc) => toTimeline(x).captions.flatMap((c) => c.words.map((w) => w.text));
    expect(kept(d)).not.toContain("lasts");
    expect(kept(r.doc)).toEqual([...kept(d).slice(0, 6), "lasts", ...kept(d).slice(6)]);
  });

  it("lifts a cut that sits wholly inside a word instead of shrinking it to nothing", () => {
    const d = docWith([strike(3100, 3250)]); // inside "whole" (3050–3300)
    const r = qcAutoFix(d);
    expect(r.issues).toEqual([]);
    expect(r.doc.beads.flatMap((b) => b.cuts).filter((c) => c.struck)).toEqual([]);
  });

  it("leaves a cut the person placed: it stays theirs, asked about, not moved", () => {
    const d = docWith([strike(700, 1000)]);
    const bead = d.beads.find((b) => b.cuts.length)!;
    const cut = bead.cuts[0]!;
    const mine = EditDoc.parse(applyChange(d, { actor: "user", reason: "moved a cut", ops: [{ op: "set", path: `/beads/@${bead.id}/cuts/@${cut.id}/endMs`, value: 1010 }] })!.doc);
    const r = qcAutoFix(mine);
    expect(r.changes).toEqual([]);
    expect(r.issues).toEqual([expect.objectContaining({ code: "mid_word_cut", gate: "ask", ours: false })]);
  });
});

describe("qcAutoFix: captions", () => {
  it("captions that would sit on the mouth move into the safe band, off the face, as one explained change", () => {
    // landscape take at 9:16: the face's mouth point at 66% of the height sits inside the default caption spot (64%+)
    const d = withFace(docWith([]), 0.66);
    const issue = qcDoc(d).find((i) => i.code === "caption_band")!;
    expect(issue).toMatchObject({ ours: true, gate: "block", message: "the captions at 0:00 cover the face" });
    const r = qcAutoFix(d);
    expect(r.changes).toEqual([expect.objectContaining({ actor: "autopilot:qc", reason: "captions moved into the safe band · off the face" })]);
    expect(r.doc.captions.place?.["9:16"]).toBeLessThan(0.66 - 0.17);
    expect(r.issues).toEqual([]);
  });

  it("a face high in the frame leaves the captions where they are", () => {
    expect(qcDoc(withFace(docWith([]), 0.4))).toEqual([]);
  });

  it("every aspect's default spot is inside its safe area for two-line captions", () => {
    for (const aspect of ["9:16", "4:5", "1:1", "16:9"] as Aspect[]) {
      expect(qcDoc({ ...docWith([]), aspect }).filter((i) => i.code === "caption_band")).toEqual([]);
    }
  });

  it("a caption spot the person pinned is theirs: asked about, never moved", () => {
    const d = withFace(docWith([]), 0.66);
    const pinned = EditDoc.parse(applyChange(d, { actor: "user", reason: "moved the captions", ops: [{ op: "set", path: "/captions/place", value: { "9:16": 0.68 } }] })!.doc);
    const r = qcAutoFix(pinned);
    expect(r.changes).toEqual([]);
    expect(r.issues).toEqual([expect.objectContaining({ code: "caption_band", gate: "ask", ours: false })]);
  });
});

// a deterministic generator of talking takes (the same one qc.test.ts uses)
function take(seed: number) {
  let x = (seed * 2654435761) % 4294967296;
  const rnd = () => (x = (x * 1664525 + 1013904223) % 4294967296) / 4294967296;
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
  return { tr: { language: "en", durationMs: t + 300, words }, faceCy: 0.3 + rnd() * 0.45 };
}

describe("the gate on ordinary autocut output", () => {
  it("after the safe fixes, blocks none of 300 generated takes at any aspect or cutdown (faces anywhere from 30% to 75%)", () => {
    const bad: string[] = [];
    let fixed = 0;
    for (let seed = 1; seed <= 300; seed++) {
      const { tr, faceCy } = take(seed);
      let doc = applyChange(emptyEditDoc("p"), addClipChange({ id: "c1", mediaId: "m1", source: "upload", w: 1920, h: 1080, durationMs: tr.durationMs, fps: 30 }))!.doc;
      for (const c of beadChanges(doc, "c1", tr, autocut({ words: tr.words }))) doc = applyChange(doc, c)?.doc ?? doc;
      doc = applyChange(doc, reframeChange("c1", [{ ms: 0, cx: 0.5, cy: faceCy, scale: 1 }], 1))!.doc;
      for (const aspect of ["9:16", "4:5", "1:1", "16:9"] as Aspect[]) {
        for (const cap of [undefined, 15_000, 30_000, 60_000]) {
          let d = EditDoc.parse({ ...doc, aspect });
          const r = qcAutoFix(d);
          fixed += r.changes.length;
          d = r.doc;
          const cut = cap && cutdownChange(d, cap);
          if (cut) d = EditDoc.parse(applyChange(d, cut)!.doc);
          for (const i of qcDoc(d)) if (i.gate === "block" && i.code !== "empty") bad.push(`seed ${seed} ${aspect} ${cap}: ${i.code} · ${i.message}`);
        }
      }
    }
    expect(bad.slice(0, 10)).toEqual([]);
    expect(fixed).toBeGreaterThan(0); // faces low in frame do get their captions moved
  }, 120_000);
});

describe("statsFromMeasure + qcExport (the worker's ffmpeg numbers)", () => {
  const doc = docWith([strike(0, 300, "filler")]);
  const dur = toTimeline(doc).durationMs;
  const clean: RenderMeasure = { durationMs: dur, black: [], frozen: [], audio: { peakDb: -1.6, rmsDb: -19, clippedRatio: 0 } };

  it("a clean file passes, and is marked checked", () => {
    const r = qcExport(doc, statsFromMeasure(clean, doc));
    expect(r).toMatchObject({ checked: true, issues: [], verdict: { ok: true } });
  });

  it("black in the file where the take wasn't blocks, with the time; black in the take too is the person's footage", () => {
    const m = { ...clean, black: [{ startMs: 1000, endMs: 1700 }] };
    const r = qcExport(doc, statsFromMeasure(m, doc));
    expect(r.verdict.ok).toBe(false);
    expect(r.headline).toMatchObject({ code: "black_frames", gate: "block", message: "the picture goes black at 0:01" });
    expect(qcAction(r.headline!)).toBe("again");
    // the same stretch, dark in the take: output 1000–1700 maps to source 1300–2000 (the 300 ms "um" is cut)
    const theirs = { ...m, sources: { c1: { black: [{ startMs: 1250, endMs: 2100 }], frozen: [] } } };
    expect(qcExport(doc, statsFromMeasure(theirs, doc)).issues).toEqual([]);
  });

  it("a short dip under the threshold is left alone (qc.ts decides, not the detector)", () => {
    expect(qcExport(doc, statsFromMeasure({ ...clean, black: [{ startMs: 1000, endMs: 1400 }] }, doc)).issues).toEqual([]);
  });

  it("a freeze longer than a second where the take moved blocks", () => {
    const r = qcExport(doc, statsFromMeasure({ ...clean, frozen: [{ startMs: 500, endMs: 2000 }] }, doc));
    expect(r.headline).toMatchObject({ code: "frozen_frames", gate: "block" });
  });

  it("clipping already in the take asks (export anyway is allowed); clipping only in the file blocks", () => {
    const hot = { ...clean, audio: { peakDb: 0, rmsDb: -9, clippedRatio: 0.01 } };
    expect(qcExport(doc, statsFromMeasure(hot, doc)).headline).toMatchObject({ code: "clipping", gate: "block" });
    const take = { ...hot, sources: { c1: { black: [], frozen: [], audio: { peakDb: 0, rmsDb: -10, clippedRatio: 0.02 } } } };
    const r = qcExport(doc, statsFromMeasure(take, doc));
    expect(r.headline).toMatchObject({ code: "clipping", gate: "ask", ours: false });
    expect(r.verdict.ok).toBe(false);
    expect(qcExport(doc, statsFromMeasure(take, doc), true).verdict.ok).toBe(true);
    expect(qcAction(r.headline!)).toBeNull();
  });

  it("a file the wrong length, or with no sound, blocks", () => {
    expect(qcExport(doc, statsFromMeasure({ ...clean, durationMs: dur - 2000 }, doc)).headline?.code).toBe("wrong_length");
    expect(qcExport(doc, statsFromMeasure({ ...clean, audio: undefined }, doc)).headline?.code).toBe("silent");
  });

  it("no measurements (an older worker): the edit's own checks still run, the file is unchecked", () => {
    const r = qcExport(doc, undefined);
    expect(r).toMatchObject({ checked: false, issues: [], verdict: { ok: true } });
    expect(qcVerdict(r.issues).ok).toBe(true);
  });
});
