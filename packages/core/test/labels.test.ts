import { describe, expect, it } from "vitest";
import { emptyEditDoc, labelsFromChange, type Change, type EditDoc } from "../src";

function doc(): EditDoc {
  const d = emptyEditDoc("p1");
  d.beads = [
    {
      id: "b1", clipId: "c1", inMs: 0, outMs: 3000, struck: false,
      cuts: [{ id: "x1", startMs: 1000, endMs: 1500, kind: "silence", struck: true }],
      words: [
        { id: "w1", text: "um", startMs: 0, endMs: 300, conf: 1, struck: true, strikeKind: "filler" },
        { id: "w2", text: "hello", startMs: 400, endMs: 800, conf: 1, struck: false },
      ],
    },
    { id: "b2", clipId: "c1", inMs: 3000, outMs: 4000, struck: true, cuts: [], words: [] },
  ];
  return d;
}
const user = (ops: Change["ops"]): Change => ({ ops, reason: "edit · by hand", actor: "user" });

describe("labelsFromChange", () => {
  it("restoring a struck word is a restore label carrying the autopilot's strike kind", () => {
    expect(labelsFromChange(doc(), user([{ op: "set", path: "/beads/@b1/words/@w1/struck", value: false }]))).toEqual([
      { kind: "restore", atMs: 0, spanMs: 300, strikeKind: "filler", by: "user" },
    ]);
  });
  it("restoring a cut and a bead are restores", () => {
    const l = labelsFromChange(doc(), user([
      { op: "set", path: "/beads/@b1/cuts/@x1/struck", value: false },
      { op: "set", path: "/beads/@b2/struck", value: false },
    ]));
    expect(l).toEqual([
      { kind: "restore", atMs: 1000, spanMs: 500, strikeKind: "silence", by: "user" },
      { kind: "restore", atMs: 3000, spanMs: 1000, by: "user" },
    ]);
  });
  it("striking a kept word is a strike label", () => {
    expect(labelsFromChange(doc(), user([{ op: "set", path: "/beads/@b1/words/@w2/struck", value: true }, { op: "set", path: "/beads/@b1/words/@w2/strikeKind", value: "user" }]))).toEqual([
      { kind: "strike", atMs: 400, spanMs: 400, strikeKind: "user", by: "user" },
    ]);
  });
  it("setting struck to its current value is no label", () => {
    expect(labelsFromChange(doc(), user([{ op: "set", path: "/beads/@b1/words/@w1/struck", value: true }]))).toEqual([]);
  });
  it("strike then restore in one change leaves a strike and a restore in order", () => {
    const l = labelsFromChange(doc(), user([
      { op: "set", path: "/beads/@b1/words/@w2/struck", value: true },
      { op: "set", path: "/beads/@b1/words/@w2/struck", value: false },
    ]));
    expect(l.map((x) => x.kind)).toEqual(["strike", "restore"]);
  });
  it("an explicit pin and a caption override are labelled", () => {
    expect(labelsFromChange(doc(), user([{ op: "insert", path: "/pins/-", value: "/beads/@b1/words/@w2" }]))).toEqual([{ kind: "pin", atMs: 400, spanMs: 400, by: "user" }]);
    expect(labelsFromChange(doc(), user([{ op: "insert", path: "/captions/overrides/-", value: { wordId: "w2", text: "Hello" } }]))).toEqual([
      { kind: "caption_edit", atMs: 400, spanMs: 400, by: "user" },
    ]);
  });
  it("autopilot changes yield no labels", () => {
    const c: Change = { ops: [{ op: "set", path: "/beads/@b1/words/@w1/struck", value: false }], reason: "restore · test", actor: "autopilot:cleanup" };
    expect(labelsFromChange(doc(), c)).toEqual([]);
  });
  it("ignores unrelated ops and unresolvable paths", () => {
    expect(labelsFromChange(doc(), user([{ op: "set", path: "/aspect", value: "1:1" }, { op: "set", path: "/beads/@nope/struck", value: true }]))).toEqual([]);
  });
});
