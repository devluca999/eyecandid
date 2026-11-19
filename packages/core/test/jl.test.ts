import { describe, expect, it } from "vitest";
import { AUDIO_FADE_MS, EditDoc, emptyEditDoc, framesOf, JL_LEAD_MS, toTimeline, type Placed } from "../src";

const w = (id: string, text: string, s: number, e: number, struck = false) => ({ id, text, startMs: s, endMs: e, conf: 1, struck });
const len = (p: { fromMs: number; toMs: number }) => p.toMs - p.fromMs;

/**
 * b1 "this ring tracks [pause cut] your sleep." · b2 (after a struck pause between beads) "it lasts a week." · b3 on
 * a second clip "link below."
 */
function doc() {
  const d = emptyEditDoc("p");
  d.clips = [
    { id: "c1", mediaId: "m1", source: "camera", w: 1080, h: 1920, durationMs: 9000, fps: 30 },
    { id: "c2", mediaId: "m2", source: "camera", w: 1080, h: 1920, durationMs: 3000, fps: 30 },
  ];
  d.beads = [
    {
      id: "b1", clipId: "c1", inMs: 0, outMs: 3000, struck: false,
      words: [w("w1", "this", 100, 400), w("w2", "ring", 450, 800), w("w3", "tracks", 850, 1300), w("w4", "your", 2000, 2300), w("w5", "sleep.", 2350, 2800)],
      cuts: [{ id: "k1", startMs: 1440, endMs: 1920, kind: "silence", struck: true }],
    },
    {
      id: "b2", clipId: "c1", inMs: 3000, outMs: 6000, struck: false,
      words: [w("w6", "it", 3700, 3800), w("w7", "lasts", 3850, 4200), w("w8", "a", 4250, 4300), w("w9", "week.", 4350, 4800)],
      cuts: [{ id: "k2", startMs: 3000, endMs: 3620, kind: "silence", struck: true }],
    },
    { id: "b3", clipId: "c2", inMs: 200, outMs: 1500, struck: false, cuts: [], words: [w("w10", "link", 300, 600), w("w11", "below.", 650, 1100)] },
  ];
  return EditDoc.parse(d);
}

function tiles(ps: Placed[], total: number) {
  let at = 0;
  for (const p of ps) {
    expect(p.atMs).toBe(at);
    expect(len(p)).toBeGreaterThan(0);
    at += len(p);
  }
  expect(at).toBe(total);
}

describe("J and L cuts", () => {
  it("the sound is exactly the kept ranges, back to back; the picture tiles the same duration", () => {
    const tl = toTimeline(doc());
    expect(tl.sound.map(({ clipId, mediaId, fromMs, toMs, beadId }) => ({ clipId, mediaId, fromMs, toMs, beadId }))).toEqual(tl.segments);
    tiles(tl.sound, tl.durationMs);
    tiles(tl.picture, tl.durationMs);
    expect(tl.picture.reduce((a, p) => a + len(p), 0)).toBe(tl.segments.reduce((a, s) => a + len(s), 0));
  });

  it("J where the next piece starts a sentence, L inside a sentence; the picture cut moves by the lead, nothing else", () => {
    const tl = toTimeline(doc());
    // b1 splits at the pause cut (mid-sentence: L), b1→b2 (new sentence: J), b2→b3 on another clip (new sentence: J)
    expect(tl.joins.map((j) => j.kind)).toEqual(["L", "J", "J"]);
    for (const [i, j] of tl.joins.entries()) {
      const cutAt = tl.sound[i + 1]!.atMs;
      expect(j.atMs).toBe(cutAt);
      expect(j.leadMs).toBeLessThanOrEqual(JL_LEAD_MS);
      const picCut = tl.picture[i + 1]!.atMs;
      // J: the picture changes after the sound; L: before it
      expect(picCut - cutAt).toBe(j.kind === "J" ? j.leadMs : -j.leadMs);
    }
    expect(tl.joins.every((j) => j.leadMs === JL_LEAD_MS)).toBe(true);
  });

  it("no overlap beyond the lead: sound never overlaps, picture never shows past a clip or repeats kept frames", () => {
    const d = doc();
    const tl = toTimeline(d);
    for (let i = 1; i < tl.sound.length; i++) expect(tl.sound[i]!.atMs).toBe(tl.sound[i - 1]!.atMs + len(tl.sound[i - 1]!));
    for (const [i, p] of tl.picture.entries()) {
      const s = tl.segments[i]!;
      expect(Math.abs(p.fromMs - s.fromMs)).toBeLessThanOrEqual(JL_LEAD_MS);
      expect(Math.abs(p.toMs - s.toMs)).toBeLessThanOrEqual(JL_LEAD_MS);
      const clip = d.clips.find((c) => c.id === p.clipId)!;
      expect(p.fromMs).toBeGreaterThanOrEqual(0);
      expect(p.toMs).toBeLessThanOrEqual(clip.durationMs);
      // a forward jump on one clip: the extra frames come from the removed gap, never from another kept piece
      for (const o of tl.segments) if (o !== s && o.clipId === p.clipId) expect(p.toMs <= o.fromMs || p.fromMs >= o.toMs).toBe(true);
    }
  });

  it("fades of half the window at every cut and at both ends, none at a seamless join", () => {
    const tl = toTimeline(doc());
    for (const s of tl.sound) {
      expect(s.fadeInMs).toBe(AUDIO_FADE_MS / 2);
      expect(s.fadeOutMs).toBe(AUDIO_FADE_MS / 2);
    }
    // two beads that tile with nothing removed between them play as one: no cut, no fade, no lead
    const d = doc();
    d.beads[1]!.cuts = [];
    d.beads[0]!.cuts = [];
    const tl2 = toTimeline(d);
    expect(tl2.sound[0]!.fadeOutMs).toBe(0);
    expect(tl2.sound[1]!.fadeInMs).toBe(0);
    expect(tl2.joins.map((j) => j.kind)).toEqual(["J"]); // only the jump to the second clip
  });

  it("the lead shrinks to fit a short piece, a narrow gap or the clip's edge", () => {
    const d = doc();
    d.beads[0]!.cuts = [{ id: "k1", startMs: 1440, endMs: 1470, kind: "silence", struck: true }]; // a 30ms gap
    const tl = toTimeline(d);
    expect(tl.joins[0]).toMatchObject({ kind: "L", leadMs: 30 });
    // the first clip ends right after b2: the picture can't run on past it, so the J into c2 is clamped
    const e = doc();
    e.clips[0]!.durationMs = 6020;
    expect(toTimeline(e).joins.at(-1)).toMatchObject({ kind: "J", leadMs: 20 });
    // a piece shorter than three leads gets a third of itself
    const f = doc();
    f.beads[2] = { ...f.beads[2]!, inMs: 300, outMs: 450, words: [w("w10", "link.", 300, 450)] };
    const tf = toTimeline(f);
    expect(tf.joins.at(-1)!.leadMs).toBe(50);
    tiles(tf.picture, tf.durationMs);
  });

  it("captions and duration are the same as before J/L (they follow the sound)", () => {
    const tl = toTimeline(doc());
    expect(tl.durationMs).toBe(tl.segments.reduce((a, s) => a + len(s), 0));
    expect(tl.captions.map((c) => c.text)).toEqual(["this ring tracks", "your sleep.", "it lasts a week.", "link below."]);
  });

  it("framesOf derives frames from cumulative ms: neighbouring pieces meet exactly, no drift", () => {
    const tl = toTimeline(doc());
    for (const track of [tl.picture, tl.sound]) {
      let end = 0;
      for (const p of track) {
        const f = framesOf(p, 30);
        expect(f.from).toBe(end);
        end = f.from + f.frames;
      }
      expect(end).toBe(Math.round((tl.durationMs / 1000) * 30));
    }
  });
});
