import { describe, expect, it } from "vitest";
import { applyChange, applyOps, emptyEditDoc, invertOps, isPinned, EditDoc, TRACK_ORDER } from "../src";

function docWithBeads() {
  const d = emptyEditDoc("p1");
  d.beads = [
    { id: "b1", clipId: "c1", inMs: 0, outMs: 1000, words: [], struck: false },
    { id: "b2", clipId: "c1", inMs: 1000, outMs: 2000, words: [], struck: false },
  ];
  return EditDoc.parse(d);
}

describe("edit model", () => {
  it("keeps the five tracks in product order", () => {
    expect(TRACK_ORDER).toEqual(["video", "broll", "voice", "music", "captions"]);
    expect(Object.keys(emptyEditDoc("p").tracks)).toEqual([...TRACK_ORDER]);
  });
  it("defaults captions on", () => {
    expect(emptyEditDoc("p").captions.enabled).toBe(true);
  });
});

describe("ops", () => {
  it("addresses array items by id and round-trips through inversion", () => {
    const d0 = docWithBeads();
    const { doc: d1, applied } = applyOps(d0, [
      { op: "set", path: "/beads/@b2/struck", value: true },
      { op: "insert", path: "/beads/-", value: { id: "b3", clipId: "c1", inMs: 2000, outMs: 2500, words: [], struck: false } },
      { op: "remove", path: "/beads/@b1" },
    ]);
    expect(d1.beads.map((b) => b.id)).toEqual(["b2", "b3"]);
    expect(d1.beads[0]!.struck).toBe(true);
    const { doc: back } = applyOps(d1, invertOps(applied));
    expect(back).toEqual(d0);
  });

  it("does not mutate the input document", () => {
    const d0 = docWithBeads();
    const snapshot = structuredClone(d0);
    applyOps(d0, [{ op: "set", path: "/aspect", value: "16:9" }]);
    expect(d0).toEqual(snapshot);
  });

  it("rejects unknown ids", () => {
    expect(() => applyOps(docWithBeads(), [{ op: "set", path: "/beads/@nope/struck", value: true }])).toThrow();
  });
});

describe("pinning", () => {
  it("user changes pin paths and autopilots skip them", () => {
    const d0 = docWithBeads();
    const r1 = applyChange(d0, { actor: "user", reason: "restored · you kept this line", ops: [{ op: "set", path: "/beads/@b1/struck", value: false }] });
    expect(r1).not.toBeNull();
    expect(r1!.doc.pins).toContain("/beads/@b1/struck");
    expect(r1!.doc.version).toBe(1);

    const r2 = applyChange(r1!.doc, {
      actor: "autopilot:autocut",
      reason: "trimmed pause · 1.2s",
      ops: [
        { op: "set", path: "/beads/@b1/struck", value: true },
        { op: "set", path: "/beads/@b2/struck", value: true },
      ],
    });
    expect(r2!.skipped.map((o) => o.path)).toEqual(["/beads/@b1/struck"]);
    expect(r2!.doc.beads[0]!.struck).toBe(false);
    expect(r2!.doc.beads[1]!.struck).toBe(true);
  });

  it("returns null when an autopilot change is fully pinned", () => {
    const d = docWithBeads();
    d.pins = ["/beads"];
    expect(applyChange(d, { actor: "autopilot:weave", reason: "cut away · you said 'ring'", ops: [{ op: "set", path: "/beads/@b1/struck", value: true }] })).toBeNull();
    expect(isPinned(["/beads"], "/beadsX")).toBe(false);
  });
});
