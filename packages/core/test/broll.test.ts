import { describe, expect, it } from "vitest";
import {
  addClipChange, applyChange, beadChanges, brollAt, brollOverlays, brollPath, brollStillChange, emptyEditDoc, firstWords, invertOps,
  isGpuWorkerProvider, kenBurnsAt, poolClaims, STILL_SIZE, stillPrompt, toTimeline, type EditDoc,
} from "../src";

const word = (text: string, s: number, e: number) => ({ text, startMs: s, endMs: e, conf: 0.9 });
const transcript = {
  language: "en",
  durationMs: 6000,
  words: [word("Um,", 0, 300), word("this", 400, 600), word("ring", 650, 900), word("tracks", 950, 1200), word("my", 1250, 1400), word("sleep.", 1450, 1800), word("Link", 2000, 2300), word("below.", 2350, 2800)],
};
const autocut = {
  strikes: [{ startMs: 0, endMs: 300, kind: "filler" as const, reason: "trimmed filler · 'um'" }],
  beads: [{ inMs: 0, outMs: 1900 }, { inMs: 2000, outMs: 2800 }],
};

function fresh(): EditDoc {
  let doc = applyChange(emptyEditDoc("p"), addClipChange({ id: "c1", mediaId: "m1", source: "upload", w: 1080, h: 1920, durationMs: 6000, fps: 30 }))!.doc;
  for (const c of beadChanges(doc, "c1", transcript, autocut)) doc = applyChange(doc, c)?.doc ?? doc;
  return doc;
}

describe("b-roll stills", () => {
  it("prompt comes from the bead's kept words through a fixed template (struck fillers left out)", () => {
    const doc = fresh();
    const p = stillPrompt(doc, doc.beads[0]!);
    expect(p).toContain(`"this ring tracks my sleep."`);
    expect(p).not.toMatch(/um/i);
    expect(p).toMatch(/no text/);
    expect(firstWords(doc, doc.beads[0]!)).toBe("this ring tracks my…");
  });

  it("sizes are multiples of 16 for every aspect", () => {
    for (const { w, h } of Object.values(STILL_SIZE)) expect([w % 16, h % 16]).toEqual([0, 0]);
  });

  it("places the still over the bead with a one-line reason; the span follows the bead's kept words", () => {
    const doc = fresh();
    const change = brollStillChange(doc, { beadId: "c1.b0", mediaId: "still1", w: 720, h: 1280 })!;
    expect(change.actor).toBe("autopilot:broll");
    expect(change.reason).toBe("b-roll · generated still for 'this ring tracks my…'");
    const next = applyChange(doc, change)!.doc;
    expect(next.tracks.broll).toHaveLength(1);
    const tl = toTimeline(next);
    const [o] = brollOverlays(next, tl.segments);
    // bead 0 tiles to 2000 (the next bead), filler 0..300 struck: kept 300..2000, so the still covers output 0..1700
    expect(o).toMatchObject({ beadId: "c1.b0", mediaId: "still1", startMs: 0, endMs: 1700 });
    expect(brollAt([o!], 800)?.mediaId).toBe("still1");
    expect(brollAt([o!], 1700)).toBeUndefined();
    // striking a word inside the bead moves the end, not a stored number
    const struck = applyChange(next, { actor: "user", reason: "cut · 'sleep.'", ops: [{ op: "set", path: "/beads/@c1.b0/words/@c1.w5/struck", value: true }] })!.doc;
    expect(brollOverlays(struck)[0]!.endMs).toBeLessThan(1700);
    // a struck bead shows no b-roll
    const gone = applyChange(next, { actor: "user", reason: "cut bead", ops: [{ op: "set", path: "/beads/@c1.b0/struck", value: true }] })!.doc;
    expect(brollOverlays(gone)).toEqual([]);
  });

  it("a second still replaces the first in the same slot", () => {
    let doc = fresh();
    doc = applyChange(doc, brollStillChange(doc, { beadId: "c1.b0", mediaId: "a", w: 720, h: 1280 })!)!.doc;
    const second = brollStillChange(doc, { beadId: "c1.b0", mediaId: "b", w: 720, h: 1280 })!;
    expect(second.ops[0]).toMatchObject({ op: "set", path: brollPath("c1.b0") });
    doc = applyChange(doc, second)!.doc;
    expect(doc.tracks.broll.map((t) => t.ref)).toEqual(["b"]);
  });

  it("respects pins: a user-touched slot or a pinned b-roll track is left alone", () => {
    let doc = fresh();
    doc = applyChange(doc, brollStillChange(doc, { beadId: "c1.b0", mediaId: "a", w: 720, h: 1280 })!)!.doc;
    const touched = applyChange(doc, { actor: "user", reason: "b-roll · moved", ops: [{ op: "set", path: `${brollPath("c1.b0")}/params/w`, value: 721 }] })!.doc;
    expect(brollStillChange(touched, { beadId: "c1.b0", mediaId: "b", w: 720, h: 1280 })).toBeNull();
    expect(brollStillChange({ ...fresh(), pins: ["/tracks/broll"] }, { beadId: "c1.b0", mediaId: "b", w: 720, h: 1280 })).toBeNull();
    expect(brollStillChange(fresh(), { beadId: "nope", mediaId: "b", w: 720, h: 1280 })).toBeNull();
  });

  it("removing it is a user change that undo puts back, and a new request after removal still lands", () => {
    let doc = fresh();
    doc = applyChange(doc, brollStillChange(doc, { beadId: "c1.b0", mediaId: "a", w: 720, h: 1280 })!)!.doc;
    const removed = applyChange(doc, { actor: "user", reason: "removed b-roll", ops: [{ op: "remove", path: brollPath("c1.b0") }] })!;
    expect(removed.doc.tracks.broll).toEqual([]);
    const back = applyChange(removed.doc, { actor: "user", reason: "undo", ops: invertOps(removed.applied) })!.doc;
    expect(back.tracks.broll.map((t) => t.ref)).toEqual(["a"]);
    expect(brollStillChange(removed.doc, { beadId: "c1.b0", mediaId: "c", w: 720, h: 1280 })).not.toBeNull();
  });

  it("ken burns pushes in slowly and fades at the ends", () => {
    const o = { startMs: 1000, endMs: 3000 };
    expect(kenBurnsAt(o, 1000)).toEqual({ scale: 1, opacity: 0 });
    expect(kenBurnsAt(o, 2000).opacity).toBe(1);
    expect(kenBurnsAt(o, 3000).scale).toBeCloseTo(1.08);
  });

  it("worker pools: -gpu providers claim only GPU types, everyone else only CPU types", () => {
    expect(isGpuWorkerProvider("modal-gpu")).toBe(true);
    expect(isGpuWorkerProvider("modal")).toBe(false);
    expect(poolClaims("modal-gpu", "still")).toBe(true);
    expect(poolClaims("modal-gpu", "transcribe")).toBe(false);
    for (const p of ["modal", "cpu", "cpu-stub", "colab", "runpod"]) {
      expect(poolClaims(p, "still")).toBe(false);
      expect(poolClaims(p, "render")).toBe(true);
    }
  });
});
