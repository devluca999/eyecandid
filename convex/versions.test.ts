import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { type EditDoc } from "@eyelore/core";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
const ANON = "anon_" + "d".repeat(32);

async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// pauses: 300ms, 700ms (autocut cut it; slow paces keep it), 1.5s (cut at every pace)
const words = [
  { text: "This", startMs: 0, endMs: 200, conf: 0.9 }, { text: "ring", startMs: 500, endMs: 800, conf: 0.9 }, { text: "tracks", startMs: 850, endMs: 1100, conf: 0.9 },
  { text: "sleep.", startMs: 1150, endMs: 1500, conf: 0.9 },
  { text: "It", startMs: 2200, endMs: 2300, conf: 0.95 }, { text: "lasts", startMs: 2350, endMs: 2600, conf: 0.95 }, { text: "a", startMs: 2650, endMs: 2700, conf: 0.95 },
  { text: "week.", startMs: 2750, endMs: 3100, conf: 0.95 }, { text: "Link", startMs: 4600, endMs: 4900, conf: 0.9 }, { text: "below.", startMs: 4950, endMs: 5400, conf: 0.9 },
];

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
  return { t, projectId, doc };
}

describe("edits.pickVersion", () => {
  it("applies punchy as one explained change by you, then the explained re-edit", async () => {
    const { t, projectId, doc } = await readyProject();
    const before = await doc();
    const r = await t.mutation(api.edits.pickVersion, { anonId: ANON, projectId, baseVersion: before.version, version: "punchy" });
    expect(r.ok).toBe(true);
    const after = await doc();
    expect(after.style.dials).toMatchObject({ pace: 0.85, energy: 0.9 });
    expect(after.captions.look).toBe("bold");
    expect(after.effects.length).toBeGreaterThan(before.effects.length); // the push-ins
    const history = await t.query(api.edits.history, { anonId: ANON, projectId });
    const pick = history.find((h) => h.reason.startsWith("picked punchy"))!;
    expect(pick).toMatchObject({ actor: "user", reason: "picked punchy · tighter pauses, push-ins, bold captions" });
    expect(history.some((h) => h.actor === "autopilot:dials")).toBe(true);
  });

  it("picking what the edit already is changes nothing", async () => {
    const { t, projectId, doc } = await readyProject();
    const v = (await doc()).version;
    await t.mutation(api.edits.pickVersion, { anonId: ANON, projectId, baseVersion: v, version: "punchy" });
    const mid = await doc();
    const r = await t.mutation(api.edits.pickVersion, { anonId: ANON, projectId, baseVersion: mid.version, version: "punchy" });
    expect(r).toMatchObject({ ok: true, same: true });
    expect((await doc()).version).toBe(mid.version);
  });

  it("leaves a pause you kept by hand alone, even at the punchiest pace", async () => {
    const { t, projectId, doc } = await readyProject();
    const before = await doc();
    const bead = before.beads.find((b) => b.cuts.some((c) => c.startMs === 3240))!;
    const cut = bead.cuts.find((c) => c.startMs === 3240)!;
    await t.mutation(api.edits.apply, { anonId: ANON, projectId, baseVersion: before.version, reason: "kept pause · 1.3s", ops: [{ op: "set", path: `/beads/@${bead.id}/cuts/@${cut.id}/struck`, value: false }] });
    await t.mutation(api.edits.pickVersion, { anonId: ANON, projectId, baseVersion: before.version + 1, version: "punchy" });
    const after = await doc();
    expect(after.beads.flatMap((b) => b.cuts).find((c) => c.id === cut.id)!.struck).toBe(false);
  });

  it("undo puts the previous version back: dials, captions and the cut", async () => {
    const { t, projectId, doc } = await readyProject();
    const before = await doc();
    await t.mutation(api.edits.pickVersion, { anonId: ANON, projectId, baseVersion: before.version, version: "punchy" });
    await t.mutation(api.edits.undo, { anonId: ANON, projectId, baseVersion: (await doc()).version });
    const after = await doc();
    expect(after.style.dials).toEqual(before.style.dials);
    expect(after.captions.look).toBe(before.captions.look);
    expect(after.beads).toEqual(before.beads);
    expect(after.effects).toEqual([]);
    const history = await t.query(api.edits.history, { anonId: ANON, projectId });
    expect(history.some((h) => h.reason.startsWith("undo · picked punchy"))).toBe(true);
  });

  it("rejects a stale base, an unknown version and other sessions", async () => {
    const { t, projectId, doc } = await readyProject();
    const v = (await doc()).version;
    expect((await t.mutation(api.edits.pickVersion, { anonId: ANON, projectId, baseVersion: v - 1, version: "punchy" })).ok).toBe(false);
    await expect(t.mutation(api.edits.pickVersion, { anonId: ANON, projectId, baseVersion: v, version: "loud" })).rejects.toThrow();
    await expect(t.mutation(api.edits.pickVersion, { anonId: "anon_" + "f".repeat(32), projectId, baseVersion: v, version: "punchy" })).rejects.toThrow();
  });
});

describe("events.track version_picked", () => {
  it("stores which version was picked", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.events.track, { anonId: ANON, event: { name: "version_picked", props: { platform: "web", version: "genre", kind: "ad" } } });
    await expect(t.mutation(api.events.track, { anonId: ANON, event: { name: "version_picked", props: { platform: "web", version: "wild" } } })).rejects.toThrow();
    const rows = await t.run((ctx) => ctx.db.query("events").collect());
    expect(rows.map((r) => r.name)).toEqual(["version_picked"]);
    expect(rows[0]!.props).toMatchObject({ version: "genre" });
  });
});
