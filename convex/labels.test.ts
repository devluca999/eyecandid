import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { type EditDoc } from "@eyelore/core";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
const ANON = "anon_" + "e".repeat(32);

async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// pauses: 300ms (fast cuts it), 700ms (autocut cut it; slow restores it), 1.5s (cut at every pace)
const words = [
  { text: "This", startMs: 0, endMs: 200, conf: 0.9 }, { text: "ring", startMs: 500, endMs: 800, conf: 0.9 }, { text: "tracks", startMs: 850, endMs: 1100, conf: 0.9 },
  { text: "sleep.", startMs: 1150, endMs: 1500, conf: 0.9 },
  { text: "It", startMs: 2200, endMs: 2300, conf: 0.95 }, { text: "lasts", startMs: 2350, endMs: 2600, conf: 0.95 }, { text: "a", startMs: 2650, endMs: 2700, conf: 0.95 },
  { text: "week.", startMs: 2750, endMs: 3100, conf: 0.95 }, { text: "Link", startMs: 4600, endMs: 4900, conf: 0.9 }, { text: "below.", startMs: 4950, endMs: 5400, conf: 0.9 },
];

/** A project that went through transcribe + autocut, as the real worker shapes it. */
async function readyProject() {
  const t = convexTest(schema, modules);
  const { token } = await t.mutation(internal.workers.register, { name: "w", provider: "cpu-stub" });
  const workerId = (await t.mutation(internal.workers.touch, { tokenHash: await sha(token) }))! as Id<"workers">;
  const projectId = await t.mutation(api.projects.create, { anonId: ANON });
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["fake video"], { type: "video/mp4" })));
  await t.mutation(api.projects.addSource, { anonId: ANON, projectId, storageId, contentType: "video/mp4", w: 640, h: 360, durationMs: 5500, source: "upload" });
  for (const [type, output] of [
    ["transcribe", { language: "en", words, durationMs: 5500 }],
    ["autocut", {
      strikes: [
        { startMs: 1640, endMs: 2120, kind: "silence", reason: "trimmed pause · 0.7s" },
        { startMs: 3240, endMs: 4520, kind: "silence", reason: "trimmed pause · 1.5s" },
      ],
      beads: [{ inMs: 0, outMs: 1500, moment: "hook" }, { inMs: 2200, outMs: 3100 }, { inMs: 4600, outMs: 5400, moment: "cta" }],
    }],
  ] as const) {
    const job = await t.mutation(internal.jobs.claim, { workerId, types: [type] });
    await t.mutation(internal.jobs.complete, { workerId, jobId: job!.id, output });
    await t.finishAllScheduledFunctions(() => {});
  }
  const doc = async () => (await t.query(api.projects.get, { projectId, anonId: ANON }))!.doc as EditDoc;
  expect((await t.query(api.projects.get, { projectId, anonId: ANON }))!.project.stage).toBe("ready");
  return { t, projectId, doc };
}


async function labels(t: Awaited<ReturnType<typeof readyProject>>["t"]) {
  return await t.run((ctx) => ctx.db.query("editLabels").collect());
}
const cutOf = (d: EditDoc, startMs: number) => {
  const bead = d.beads.find((b) => b.cuts.some((c) => c.startMs === startMs))!;
  return { bead, cut: bead.cuts.find((c) => c.startMs === startMs)! };
};

describe("editLabels", () => {
  it("autopilot output and the pipeline wrote no labels", async () => {
    const { t } = await readyProject();
    expect(await labels(t)).toEqual([]);
  });

  it("a restored pause writes a restore label owned by the anon hash, never the raw id", async () => {
    const { t, projectId, doc } = await readyProject();
    const d = await doc();
    const { bead, cut } = cutOf(d, 1640);
    await t.mutation(api.edits.apply, { anonId: ANON, projectId, baseVersion: d.version, reason: "kept pause", ops: [{ op: "set", path: `/beads/@${bead.id}/cuts/@${cut.id}/struck`, value: false }] });
    const rows = await labels(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ projectId, kind: "restore", atMs: 1640, strikeKind: "silence", docVersion: d.version + 1 });
    expect(rows[0]!.anonHash).toBe((await sha(ANON)).slice(0, 32));
    expect(JSON.stringify(rows)).not.toContain(ANON.slice(5));
  });

  it("a pinned window and a caption edit write pin and caption_edit labels", async () => {
    const { t, projectId, doc } = await readyProject();
    const d = await doc();
    const word = d.beads.flatMap((b) => b.words).find((w) => w.text === "ring")!;
    const bead = d.beads.find((b) => b.words.some((w) => w.id === word.id))!;
    await t.mutation(api.edits.apply, { anonId: ANON, projectId, baseVersion: d.version, reason: "pinned", ops: [{ op: "insert", path: "/pins/-", value: `/beads/@${bead.id}/words/@${word.id}` }] });
    await t.mutation(api.edits.apply, { anonId: ANON, projectId, baseVersion: d.version + 1, reason: "fixed spelling", ops: [{ op: "insert", path: "/captions/overrides/-", value: { wordId: word.id, text: "Ring" } }] });
    const rows = (await labels(t)).sort((a, b) => a.docVersion - b.docVersion);
    expect(rows.map((r) => r.kind)).toEqual(["pin", "caption_edit"]);
    expect(rows[0]).toMatchObject({ atMs: word.startMs, spanMs: word.endMs - word.startMs });
  });

  it("a dial move writes none; its autopilot follow-ups never label", async () => {
    const { t, projectId, doc } = await readyProject();
    const d = await doc();
    await t.mutation(api.edits.setDials, { anonId: ANON, projectId, baseVersion: d.version, dials: { pace: 0, brollDensity: 0.3, energy: 0.5 } });
    expect(await labels(t)).toEqual([]);
  });

  it("undo writes no reversal label and drops the labels of the change it undoes", async () => {
    const { t, projectId, doc } = await readyProject();
    const d = await doc();
    const { bead, cut } = cutOf(d, 1640);
    await t.mutation(api.edits.apply, { anonId: ANON, projectId, baseVersion: d.version, reason: "kept pause", ops: [{ op: "set", path: `/beads/@${bead.id}/cuts/@${cut.id}/struck`, value: false }] });
    expect(await labels(t)).toHaveLength(1);
    const r = await t.mutation(api.edits.undo, { anonId: ANON, projectId, baseVersion: d.version + 1 });
    expect(r.ok).toBe(true);
    expect(await labels(t)).toEqual([]);
  });

  it("exportLabels pages through labels, bounded and filterable by kind", async () => {
    const { t, projectId, doc } = await readyProject();
    let d = await doc();
    for (const startMs of [1640, 3240]) {
      const { bead, cut } = cutOf(d, startMs);
      await t.mutation(api.edits.apply, { anonId: ANON, projectId, baseVersion: d.version, reason: "kept pause", ops: [{ op: "set", path: `/beads/@${bead.id}/cuts/@${cut.id}/struck`, value: false }] });
      d = await doc();
    }
    const p1 = await t.query(internal.labels.exportLabels, { numItems: 1 });
    expect(p1.page).toHaveLength(1);
    expect(p1.isDone).toBe(false);
    const p2 = await t.query(internal.labels.exportLabels, { numItems: 1, cursor: p1.continueCursor });
    expect(p2.page).toHaveLength(1);
    expect(p2.page[0]!._id).not.toBe(p1.page[0]!._id);
    expect((await t.query(internal.labels.exportLabels, { kind: "pin" })).page).toEqual([]);
    expect((await t.query(internal.labels.exportLabels, { kind: "restore" })).page).toHaveLength(2);
  });

  it("deleting the project deletes its labels", async () => {
    const { t, projectId, doc } = await readyProject();
    const d = await doc();
    const { bead, cut } = cutOf(d, 1640);
    await t.mutation(api.edits.apply, { anonId: ANON, projectId, baseVersion: d.version, reason: "kept pause", ops: [{ op: "set", path: `/beads/@${bead.id}/cuts/@${cut.id}/struck`, value: false }] });
    expect(await labels(t)).toHaveLength(1);
    await t.mutation(api.projects.remove, { anonId: ANON, projectId });
    await t.finishAllScheduledFunctions(() => {});
    expect(await labels(t)).toEqual([]);
  });
});
