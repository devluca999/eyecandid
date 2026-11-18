import { describe, expect, it } from "vitest";
import {
  Actor, addClipChange, applyChange, autocut as runAutocut, beadChanges, BROLL_NOTE, Change, dialChanges, EditDoc, emptyEditDoc, pauseLimitMs,
  punchAt, punchScale, toTimeline, withDials, type DialValues,
} from "../src";

const word = (text: string, s: number, e: number, conf = 0.9) => ({ text, startMs: s, endMs: e, conf });
// pauses: 100ms (keeps), 300ms (fast cuts it), 700ms (autocut cuts it; slow keeps it), 1500ms (cut even at slow)
const transcript = {
  language: "en",
  durationMs: 9000,
  words: [
    word("Um,", 0, 300), word("this", 400, 600), word("ring", 900, 1100), word("tracks", 1150, 1400), word("sleep.", 1450, 1800),
    word("It", 2500, 2600), word("lasts", 2650, 2900), word("a", 2950, 3000), word("whole", 3050, 3300), word("week.", 3350, 3700, 0.99),
    word("Link", 5200, 5500), word("below.", 5550, 6000),
  ],
};
// the real autocut: gaps >= 450ms struck, keeping a 140ms tail and an 80ms lead
const autocut = runAutocut({ words: transcript.words, minSilenceMs: 450, fillers: ["um"] });

function fresh(): EditDoc {
  let doc = applyChange(emptyEditDoc("p"), addClipChange({ id: "c1", mediaId: "m1", source: "upload", w: 640, h: 360, durationMs: 9000, fps: 15 }))!.doc;
  for (const c of beadChanges(doc, "c1", transcript, autocut)) doc = applyChange(doc, c)!.doc;
  return doc;
}
const D = (o: Partial<DialValues> = {}): DialValues => ({ pace: 0.5, brollDensity: 0.3, energy: 0.5, ...o });
function run(doc: EditDoc, dials: DialValues) {
  for (const c of dialChanges(doc, dials)) {
    const r = applyChange(doc, c);
    if (r) doc = EditDoc.parse(r.doc);
  }
  return doc;
}
const strip = (d: EditDoc) => ({ ...d, version: 0 });
const dur = (d: EditDoc) => toTimeline(d).durationMs;

describe("dials", () => {
  it("a fresh autocut edit is already where the default dials say: no changes", () => {
    expect(dialChanges(fresh(), D())).toEqual([]);
    expect(dialChanges(fresh(), fresh().style.dials)).toEqual([]);
  });

  it("autocut's shape is what the dials expect: 140ms tail, 80ms lead", () => {
    expect(autocut.strikes.map((x) => [x.startMs, x.endMs, x.kind])).toEqual([[0, 300, "filler"], [1940, 2420, "silence"], [3840, 5120, "silence"]]);
  });

  it("a filler merged with the pauses around it is one pause to the dial: no-op at 0.5, restorable, reversible", () => {
    // "this [300] um [300] works [200] uh [200] fine": the um run is a 600ms pause (autocut cuts it), the uh run 400ms (it doesn't)
    const words = [word("this", 0, 300), word("um", 600, 800), word("works", 1100, 1400), word("uh", 1600, 1700), word("fine.", 1900, 2200)];
    const t = { language: "en", durationMs: 3000, words };
    let d = applyChange(emptyEditDoc("p"), addClipChange({ id: "c1", mediaId: "m1", source: "upload", w: 640, h: 360, durationMs: 3000, fps: 15 }))!.doc;
    for (const c of beadChanges(d, "c1", t, runAutocut({ words, minSilenceMs: 450, fillers: ["um", "uh"] }))) d = applyChange(d, c)!.doc;
    // one change for the um and the air around it: the word struck, the swallowed pause as restorable cuts
    expect(d.beads[0]!.cuts.map((c) => [c.startMs, c.endMs])).toEqual([[440, 600], [800, 1020]]);
    expect(dur(d)).toBe(2200 - (1020 - 440) - 100);
    expect(dialChanges(d, D())).toEqual([]);
    const slow = run(d, D({ pace: 0 }));
    expect(slow.beads[0]!.cuts.every((c) => !c.struck)).toBe(true);
    const fast = run(d, D({ pace: 1 }));
    expect(dur(fast)).toBeLessThan(dur(d));
    expect(dialChanges(fast, D({ pace: 1 }))).toEqual([]);
    for (const there of [slow, fast]) expect(strip(run(there, D()))).toEqual(strip(d));
  });

  it("maps pace to a pause line: slow 1.2s, 0.5 = autocut's 450ms, fast 0.25s", () => {
    expect(pauseLimitMs(0)).toBe(1200);
    expect(pauseLimitMs(0.5)).toBe(450);
    expect(pauseLimitMs(1)).toBe(250);
    for (let p = 0; p < 1; p += 0.05) expect(pauseLimitMs(p + 0.05)).toBeLessThanOrEqual(pauseLimitMs(p));
  });

  it("slow pace restores pauses under 1.2s; fast cuts anything over 0.25s; every change explains itself", () => {
    const doc = fresh();
    const slow = dialChanges(doc, D({ pace: 0 }));
    expect(slow.map((c) => c.reason)).toEqual(["pause kept · 0.7s · pace"]);
    expect(dur(run(doc, D({ pace: 0 })))).toBeGreaterThan(dur(doc));

    const fast = dialChanges(doc, D({ pace: 1 }));
    expect(fast.map((c) => c.reason)).toEqual(["pause cut · 0.3s · pace"]);
    const fastDoc = run(doc, D({ pace: 1 }));
    expect(dur(fastDoc)).toBe(dur(doc) - (300 - 135 - 80)); // 45% of 300 caps the tail at 135
    // the 100ms pause stays; the 1.5s one is cut at every pace
    expect(fastDoc.beads[2]!.cuts).toHaveLength(0);
    expect(fastDoc.beads.flatMap((b) => b.cuts).find((c) => c.startMs === 3840)!.struck).toBe(true);
    expect(run(doc, D({ pace: 0 })).beads.flatMap((b) => b.cuts).find((c) => c.startMs === 3840)!.struck).toBe(true);
  });

  it("every change is a valid, reversible autopilot:dials change with a one-line reason", () => {
    const changes = [...dialChanges(fresh(), D({ pace: 0, energy: 1 })), ...dialChanges(fresh(), D({ pace: 1 }))];
    expect(changes.length).toBeGreaterThan(3);
    for (const c of changes) {
      expect(() => Change.parse(c)).not.toThrow();
      expect(Actor.parse(c.actor)).toBe("autopilot:dials");
      expect(c.reason).not.toMatch(/\n/);
    }
  });

  it("round-trips: turning a dial and turning it back restores the doc exactly", () => {
    const doc = fresh();
    for (const there of [D({ pace: 1 }), D({ pace: 0 }), D({ energy: 1 }), D({ pace: 1, energy: 0.9 }), D({ pace: 0.1, energy: 0.6 })]) {
      const moved = run(doc, there);
      expect(strip(moved)).not.toEqual(strip(doc));
      expect(strip(run(moved, D()))).toEqual(strip(doc));
    }
  });

  it("is idempotent: run on its own result it has nothing left to do", () => {
    for (const d of [D({ pace: 0 }), D({ pace: 1 }), D({ energy: 0.8 }), D({ pace: 0.9, energy: 1 })]) {
      expect(dialChanges(run(fresh(), d), d)).toEqual([]);
    }
  });

  it("is monotonic: a faster pace never keeps a pause a slower one cut", () => {
    let prev = Infinity;
    for (let p = 0; p <= 1.0001; p += 0.1) {
      const d = dur(run(fresh(), D({ pace: p })));
      expect(d).toBeLessThanOrEqual(prev);
      prev = d;
    }
  });

  it("never touches what you pinned: a pause you restored stays restored at any pace", () => {
    let doc = fresh();
    const b = doc.beads.find((x) => x.cuts.some((c) => c.startMs === 1940))!;
    const c = b.cuts.find((x) => x.startMs === 1940)!;
    doc = applyChange(doc, { actor: "user", reason: "kept pause · 0.5s", ops: [{ op: "set", path: `/beads/@${b.id}/cuts/@${c.id}/struck`, value: false }] })!.doc;
    // fast would cut it; the user said keep it
    expect(dialChanges(doc, D({ pace: 1 })).flatMap((x) => x.ops).some((o) => o.path.includes(c.id))).toBe(false);
    // a dial-made cut the user touched isn't removed either
    let fast = run(fresh(), D({ pace: 1 }));
    const pb = fast.beads.find((x) => x.cuts.some((k) => k.id.includes(".p")))!;
    const pc = pb.cuts.find((k) => k.id.includes(".p"))!;
    fast = applyChange(fast, { actor: "user", reason: "kept pause", ops: [{ op: "set", path: `/beads/@${pb.id}/cuts/@${pc.id}/struck`, value: false }] })!.doc;
    expect(dialChanges(fast, D({ pace: 0 })).flatMap((x) => x.ops).some((o) => o.path.includes(pc.id))).toBe(false);
  });

  it("energy punches in on the hook and best line, then the call to action, then more beads", () => {
    const doc = fresh();
    expect(punchScale(0.5)).toBeNull();
    expect(punchScale(0.6)).toBeCloseTo(1.06, 5);
    expect(punchScale(1)).toBeCloseTo(1.12, 5);
    expect(dialChanges(doc, D({ energy: 0.2 }))).toEqual([]);
    expect(dialChanges(doc, D({ energy: 0.6 })).map((c) => c.reason)).toEqual(["punch-in · your hook", "punch-in · your best line"]);
    expect(dialChanges(doc, D({ energy: 0.8 })).map((c) => c.reason)).toEqual(["punch-in · your hook", "punch-in · your best line", "punch-in · your call to action"]);
    const hi = run(doc, D({ energy: 1 }));
    expect(hi.effects.every((f) => f.kind === "punch_in" && f.params.scale === 1.12)).toBe(true);
    // the preview and the renderer read the same scale: inside the hook it's pushed in, outside a punch-in it's not
    const hook = hi.beads.find((b) => b.moment === "hook")!;
    expect(punchAt(hi, "c1", hook.inMs + 500)).toBe(1.12);
    expect(punchAt(doc, "c1", hook.inMs + 500)).toBe(1);
    // turning energy down re-scales, then removes
    expect(dialChanges(hi, D({ energy: 0.6 })).every((c) => /punch-in/.test(c.reason))).toBe(true);
    expect(run(hi, D({ energy: 0.5 })).effects).toEqual([]);
  });

  it("withDials previews exactly what the server will commit, keeping the server's version", () => {
    const doc = fresh();
    const d = D({ pace: 1, energy: 0.9 });
    const p = withDials(doc, d);
    expect(p.version).toBe(doc.version);
    expect(p.style.dials).toEqual(d);
    expect(strip({ ...run(doc, d), style: p.style })).toEqual(strip(p));
    expect(withDials(doc, D())).toEqual({ ...doc, style: { ...doc.style, dials: D() } });
  });

  it("b-roll density decides nothing until there is b-roll, and says so", () => {
    expect(dialChanges(fresh(), D({ brollDensity: 1 }))).toEqual([]);
    expect(dialChanges(fresh(), D({ brollDensity: 0 }))).toEqual([]);
    expect(BROLL_NOTE).toBe("no b-roll yet · add clips to weave");
  });
});
