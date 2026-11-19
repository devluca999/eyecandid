import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyEditDoc } from "@eyelore/core";
import schema from "./schema";
import { api } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { LABEL_CAP } from "./lib/labels";

const modules = import.meta.glob("./**/*.ts");
const ANON = "anon_" + "d".repeat(32);
const TOKEN = "test-token-not-a-secret";
type T = ReturnType<typeof convexTest>;

const w = (id: string, text: string, startMs: number, endMs: number, extra: object = {}) => ({ id, text, startMs, endMs, conf: 0.9, struck: false, ...extra });

/** A ready project: one bead; "um" struck as a filler, "green" and "sky" kept. */
async function seed(t: T) {
  const projectId = await t.mutation(api.projects.create, { anonId: ANON });
  await t.run(async (ctx) => {
    const row = await ctx.db.query("editDocs").withIndex("by_project", (q) => q.eq("projectId", projectId)).unique();
    const doc = emptyEditDoc(projectId);
    doc.clips = [{ id: "c1", mediaId: "m1", source: "upload", w: 640, h: 360, durationMs: 5000, fps: 30 }];
    doc.beads = [
      {
        id: "b1", clipId: "c1", inMs: 0, outMs: 5000, cuts: [], struck: false,
        words: [w("w1", "um", 100, 400, { struck: true, strikeKind: "filler" }), w("w2", "green", 500, 900), w("w3", "sky", 1000, 1300)],
      },
    ] as typeof doc.beads;
    await ctx.db.patch(row!._id, { doc });
    await ctx.db.patch(projectId, { stage: "ready" });
  });
  return projectId;
}
const labels = (t: T) => t.run((ctx) => ctx.db.query("editLabels").collect());
const version = async (t: T, projectId: Id<"projects">) => (await t.query(api.projects.get, { projectId, anonId: ANON }))!.doc.version as number;
const edit = async (t: T, projectId: Id<"projects">, ops: unknown[], reason = "fix") =>
  t.mutation(api.edits.apply, { anonId: ANON, projectId, baseVersion: await version(t, projectId), ops, reason });

describe("labels from user edits", () => {
  it("restoring a struck filler writes one restore label with timings and strikeKind", async () => {
    const t = convexTest(schema, modules);
    const p = await seed(t);
    const r = await edit(t, p, [{ op: "set", path: "/beads/@b1/words/@w1/struck", value: false }], "restore um");
    expect(r.ok).toBe(true);
    const rows = await labels(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ projectId: p, kind: "restore", atMs: 100, spanMs: 300, strikeKind: "filler", docVersion: (r as { version: number }).version });
    expect(rows[0]!.owner).toMatch(/^a:[0-9a-f]{32}$/);
    expect(rows[0]!.owner).not.toContain(ANON);
  });

  it("striking a kept word writes a strike label", async () => {
    const t = convexTest(schema, modules);
    const p = await seed(t);
    await edit(t, p, [{ op: "set", path: "/beads/@b1/words/@w2/struck", value: true }], "cut green");
    const rows = await labels(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "strike", atMs: 500, spanMs: 400, strikeKind: "user" });
  });

  it("a caption override writes caption_edit and stores no text", async () => {
    const t = convexTest(schema, modules);
    const p = await seed(t);
    const r = await edit(t, p, [{ op: "insert", path: "/captions/overrides/-", value: { wordId: "w2", text: "Green" } }], "fix caption");
    expect(r.ok).toBe(true);
    const rows = await labels(t);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ kind: "caption_edit", atMs: 500, spanMs: 400 });
    expect(Object.keys(rows[0]!).filter((k) => /text|word|caption|email/i.test(k))).toEqual([]);
    expect(JSON.stringify(rows[0])).not.toMatch(/green/i);
  });

  it("an autopilot dial change writes nothing", async () => {
    const t = convexTest(schema, modules);
    const p = await seed(t);
    await t.mutation(api.edits.setDials, { anonId: ANON, projectId: p, baseVersion: await version(t, p), dials: { pace: 0, brollDensity: 0.3, energy: 0.5 } });
    expect(await labels(t)).toHaveLength(0);
  });

  it("undo writes no label for itself and takes back the undone change's labels", async () => {
    const t = convexTest(schema, modules);
    const p = await seed(t);
    await edit(t, p, [{ op: "set", path: "/beads/@b1/words/@w1/struck", value: false }], "restore um");
    expect(await labels(t)).toHaveLength(1);
    const r = await t.mutation(api.edits.undo, { anonId: ANON, projectId: p, baseVersion: await version(t, p) });
    expect(r.ok).toBe(true);
    expect(await labels(t)).toHaveLength(0);
  });

  it("stops at the per-project cap", async () => {
    const t = convexTest(schema, modules);
    const p = await seed(t);
    await t.run(async (ctx) => {
      for (let i = 0; i < LABEL_CAP - 1; i++) await ctx.db.insert("editLabels", { projectId: p, kind: "pin", atMs: i, spanMs: 1, docVersion: 0, at: Date.now(), owner: "a:x" });
    });
    // two labels in one change: only one fits
    await edit(t, p, [
      { op: "set", path: "/beads/@b1/words/@w1/struck", value: false },
      { op: "set", path: "/beads/@b1/words/@w2/struck", value: true },
    ]);
    expect(await labels(t)).toHaveLength(LABEL_CAP);
    await edit(t, p, [{ op: "set", path: "/beads/@b1/words/@w3/struck", value: true }]);
    expect(await labels(t)).toHaveLength(LABEL_CAP);
  });
});

describe("labels are deleted with the edit", () => {
  it("purge removes them", async () => {
    const t = convexTest(schema, modules);
    const p = await seed(t);
    await edit(t, p, [{ op: "set", path: "/beads/@b1/words/@w1/struck", value: false }]);
    expect(await labels(t)).toHaveLength(1);
    await t.mutation(api.projects.remove, { anonId: ANON, projectId: p });
    await t.finishAllScheduledFunctions(() => {});
    expect(await labels(t)).toHaveLength(0);
  });
});

describe("labels.summary", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("refuses a wrong token, and says so when unconfigured", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.labels.summary, { token: "x" })).toEqual({ configured: false });
    vi.stubEnv("EYELORE_ADMIN_TOKEN", TOKEN);
    await expect(t.query(api.labels.summary, { token: "nope" })).rejects.toThrow("not allowed");
  });

  it("counts by kind and strikeKind inside the window", async () => {
    vi.stubEnv("EYELORE_ADMIN_TOKEN", TOKEN);
    const t = convexTest(schema, modules);
    const p = await seed(t);
    const now = Date.now();
    await t.run(async (ctx) => {
      const row = (kind: "restore" | "strike" | "pin", strikeKind: "filler" | "silence" | undefined, at: number) =>
        ctx.db.insert("editLabels", { projectId: p, kind, atMs: 0, spanMs: 1, ...(strikeKind ? { strikeKind } : {}), docVersion: 1, at, owner: "a:x" });
      await row("restore", "filler", now);
      await row("restore", "filler", now);
      await row("restore", "silence", now);
      await row("strike", undefined, now);
      await row("pin", undefined, now - 40 * 86_400_000); // outside 30 days
    });
    const s = await t.query(api.labels.summary, { token: TOKEN });
    expect(s).toMatchObject({ configured: true, days: 30, total: 4, truncated: false, byKind: { restore: 3, strike: 1, pin: 0, caption_edit: 0 }, byStrikeKind: { "restore:filler": 2, "restore:silence": 1 } });
  });
});
