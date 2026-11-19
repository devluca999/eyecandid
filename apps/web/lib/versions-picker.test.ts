import { describe, expect, it } from "vitest";
import { addClipChange, applyChange, beadChanges, EditDoc, emptyEditDoc, versionChanges } from "@eyelore/core";
import { pickerOffered, pickReason, previews, versionCards } from "./versions-picker";

const word = (text: string, s: number, e: number) => ({ text, startMs: s, endMs: e, conf: 0.9 });
const words = [word("So", 0, 200), word("this", 300, 500), word("ring", 600, 900), word("tracks", 1000, 1300), word("sleep.", 1400, 1800), word("Link", 3000, 3300), word("below.", 3400, 3800)];
function doc(): EditDoc {
  let d = applyChange(emptyEditDoc("p"), addClipChange({ id: "c1", mediaId: "m1", source: "upload", w: 640, h: 360, durationMs: 4300, fps: 30 }))!.doc;
  const strikes = [{ startMs: 1920, endMs: 2880, kind: "silence" as const, reason: "trimmed pause" }];
  for (const c of beadChanges(d, "c1", { language: "en", durationMs: 4300, words }, { strikes, beads: [{ inMs: 0, outMs: 1800 }, { inMs: 3000, outMs: 3800 }] })) d = applyChange(d, c)!.doc;
  return EditDoc.parse(d);
}

describe("picker state", () => {
  it("is offered only once the edit is ready, in the edit view, with something to show", () => {
    expect(pickerOffered("ready", "edit", doc())).toBe(true);
    expect(pickerOffered("cutting", "edit", doc())).toBe(false);
    expect(pickerOffered("transcribing", "edit", null)).toBe(false);
    expect(pickerOffered("ready", "board", doc())).toBe(false);
    expect(pickerOffered("ready", "edit", emptyEditDoc("p"))).toBe(false);
  });

  it("shows clean, punchy, genre in order, each with its one-line difference and an accessible name", () => {
    const cards = versionCards(doc());
    expect(cards.map((c) => c.id)).toEqual(["clean", "punchy", "genre"]);
    expect(cards[1]).toMatchObject({ title: "punchy", blurb: "tighter pauses, push-ins, bold captions" });
    expect(cards[2]!.title).toMatch(/^genre · /);
    for (const c of cards) expect(c.name).toContain(c.blurb);
  });

  it("marks at most one card current: the version the edit is in after a pick", () => {
    const d = doc();
    expect(versionCards(d).filter((c) => c.current).length).toBeLessThanOrEqual(1);
    let next = d;
    for (const c of versionChanges(d, "punchy")) next = EditDoc.parse(applyChange(next, c)?.doc ?? next);
    const marked = versionCards(next).filter((c) => c.current);
    expect(marked.map((c) => c.id)).toEqual(["punchy"]);
    expect(marked[0]!.name).toMatch(/\(current\)$/);
  });

  it("previews are local: the version number and pins stay the server's", () => {
    const d = doc();
    const p = previews(d);
    expect(Object.keys(p)).toEqual(["clean", "punchy", "genre"]);
    for (const id of ["clean", "punchy", "genre"] as const) {
      expect(p[id].version).toBe(d.version);
      expect(p[id].pins).toEqual(d.pins);
    }
    expect(p.punchy.captions.look).toBe("bold");
  });

  it("the reason line matches what the server writes for the pick", () => {
    const d = doc();
    expect(pickReason(d, "punchy")).toBe("picked punchy · tighter pauses, push-ins, bold captions");
    expect(versionChanges(d, "punchy")[0]!.reason).toBe(pickReason(d, "punchy"));
  });
});
