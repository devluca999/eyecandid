import { describe, expect, it } from "vitest";
import { addClipChange, applyChange, beadChanges, Change, EditDoc, emptyEditDoc, toTimeline } from "../src";
import { currentVersion, previewVersion, takeKind, VERSION_IDS, versionChanges, versionPreset } from "../src/versions";

const word = (text: string, s: number, e: number) => ({ text, startMs: s, endMs: e, conf: 0.9 });
const say = (texts: string[], gaps: number[] = []) => {
  let t = 0;
  return texts.map((text, i) => {
    const w = word(text, t, t + 250);
    t += 250 + (gaps[i] ?? 100);
    return w;
  });
};
function docFor(words: ReturnType<typeof word>[], split: number[] = []): EditDoc {
  const durationMs = words.at(-1)!.endMs + 500;
  let doc = applyChange(emptyEditDoc("p"), addClipChange({ id: "c1", mediaId: "m1", source: "upload", w: 640, h: 360, durationMs, fps: 30 }))!.doc;
  const edges = [0, ...split, words.length];
  const beads = edges.slice(0, -1).map((from, i) => ({ inMs: words[from]!.startMs, outMs: words[edges[i + 1]! - 1]!.endMs }));
  // a gap of 450 ms or more is a pause autocut strikes, minus 120 ms of breath each side
  const strikes = words.slice(0, -1).flatMap((w, i) => {
    const gap = words[i + 1]!.startMs - w.endMs;
    return gap >= 450 ? [{ startMs: w.endMs + 120, endMs: words[i + 1]!.startMs - 120, kind: "silence" as const, reason: "trimmed pause" }] : [];
  });
  for (const c of beadChanges(doc, "c1", { language: "en", durationMs, words }, { strikes, beads })) doc = applyChange(doc, c)!.doc;
  return EditDoc.parse(doc);
}
// pauses of 100 (kept by all), 380 (only fast paces cut it), 700 (autocut cut it; slow paces keep it)
const talk = () => docFor(say(["So", "this", "ring", "tracks", "sleep.", "It", "lasts", "a", "week.", "Honestly", "great."], [100, 380, 100, 100, 700, 100, 100, 100, 700, 100]), [5, 9]);
const apply = (doc: EditDoc, changes: Change[]) => {
  for (const c of changes) doc = EditDoc.parse(applyChange(doc, c)?.doc ?? doc);
  return doc;
};
const dur = (d: EditDoc) => toTimeline(d).durationMs;

describe("versions", () => {
  it("a fresh autocut edit is already the clean version: no changes", () => {
    expect(versionChanges(talk(), "clean")).toEqual([]);
    expect(currentVersion(talk())).toBe("clean");
  });

  it("punchy is shorter than clean, with push-ins and bold captions, and every change explains itself", () => {
    const doc = talk();
    const changes = versionChanges(doc, "punchy");
    expect(changes[0]).toMatchObject({ actor: "user", reason: "picked punchy · tighter pauses, push-ins, bold captions" });
    for (const c of changes) expect(Change.safeParse(c).success).toBe(true);
    for (const c of changes.slice(1)) expect(c.actor).toBe("autopilot:dials");
    const punchy = apply(doc, changes);
    expect(dur(punchy)).toBeLessThan(dur(doc));
    expect(punchy.captions.look).toBe("bold");
    expect(punchy.effects.some((e) => e.kind === "punch_in")).toBe(true);
    expect(currentVersion(punchy)).toBe("punchy");
  });

  it("picking a version and then clean again restores the cut exactly", () => {
    const doc = talk();
    const back = apply(apply(doc, versionChanges(doc, "punchy")), versionChanges(apply(doc, versionChanges(doc, "punchy")), "clean"));
    expect(toTimeline(back)).toEqual(toTimeline(doc));
    expect(back.effects).toEqual(doc.effects);
    expect(back.captions.look).toBe("clean");
  });

  it("applying a version twice changes nothing the second time", () => {
    for (const id of VERSION_IDS) {
      const once = apply(talk(), versionChanges(talk(), id));
      expect(versionChanges(once, id)).toEqual([]);
    }
  });

  it("never re-decides what the person pinned", () => {
    const doc = talk();
    const cut = doc.beads.flatMap((b) => b.cuts)[0]!;
    const bead = doc.beads.find((b) => b.cuts.includes(cut))!;
    // the person restores a pause autocut had cut: that pins it
    const mine = apply(doc, [{ actor: "user", reason: "pause kept", ops: [{ op: "set", path: `/beads/@${bead.id}/cuts/@${cut.id}/struck`, value: false }] }]);
    const punchy = apply(mine, versionChanges(mine, "punchy"));
    expect(punchy.beads.flatMap((b) => b.cuts).find((c) => c.id === cut.id)!.struck).toBe(false);
  });

  it("the preview is the same cut as applying the version, without saving or pinning anything", () => {
    const doc = talk();
    for (const id of VERSION_IDS) {
      const applied = apply(doc, versionChanges(doc, id));
      const preview = previewVersion(doc, id);
      expect(toTimeline(preview)).toEqual(toTimeline(applied));
      expect(preview.captions.look).toBe(applied.captions.look);
      expect(preview.effects).toEqual(applied.effects);
      expect(preview.version).toBe(doc.version);
      expect(preview.pins).toEqual(doc.pins);
    }
  });
});

describe("takeKind", () => {
  it("reads an ad from its ask", () => {
    expect(takeKind(docFor(say(["Use", "my", "code", "for", "free", "shipping.", "Link", "below."])))).toBe("ad");
  });
  it("reads a how-to from its steps", () => {
    expect(takeKind(docFor(say(["First", "open", "the", "app.", "Then", "tap", "record."])))).toBe("how_to");
  });
  it("falls back to story on thin or mixed evidence", () => {
    expect(takeKind(docFor(say(["I", "got", "it", "for", "free", "last", "year."])))).toBe("story");
    expect(takeKind(docFor(say(["First", "buy", "it.", "Then", "use", "code", "ten."])))).toBe("story");
  });
  it("ignores words the edit cut", () => {
    const d = docFor(say(["Link", "below.", "Use", "my", "code.", "I", "love", "it."]), [5]);
    const cut = EditDoc.parse({ ...d, beads: d.beads.map((b, i) => (i === 0 ? { ...b, struck: true } : b)) });
    expect(takeKind(cut)).toBe("story");
  });
  it("the genre version names the kind it picked", () => {
    const ad = docFor(say(["Use", "my", "code", "for", "free", "shipping.", "Link", "below."]));
    expect(versionPreset(ad, "genre")).toMatchObject({ kind: "ad", label: "ad" });
    expect(apply(ad, versionChanges(ad, "genre")).genre).toBe("ad");
  });
});
