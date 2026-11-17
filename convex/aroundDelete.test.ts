import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { emptyEditDoc } from "@eyelore/core";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
const ANON = "anon_" + "a".repeat(32);
const ANON2 = "anon_" + "b".repeat(32);
const ALICE = { subject: "user_alice", email: "alice@example.com" };

type T = ReturnType<typeof convexTest>;
const mk = () => convexTest(schema, modules);

async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** A project owned by Alice (or, with `anonymous`, by the anon id alone) whose edit is one bead of `durationMs`. */
async function seed(t: T, anonId: string, durationMs = 20_000, anonymous = false) {
  const projectId = await (anonymous ? t : t.withIdentity(ALICE)).mutation(api.projects.create, { anonId });
  await t.run(async (ctx) => {
    const row = await ctx.db.query("editDocs").withIndex("by_project", (q) => q.eq("projectId", projectId)).unique();
    const doc = emptyEditDoc(projectId);
    doc.clips = [{ id: "c1", mediaId: "m1", source: "upload", w: 640, h: 360, durationMs, fps: 30 }];
    doc.beads = [{ id: "b1", clipId: "c1", inMs: 0, outMs: durationMs, words: [], cuts: [], struck: false }] as typeof doc.beads;
    await ctx.db.patch(row!._id, { doc });
    await ctx.db.patch(projectId, { stage: "ready" });
  });
  return projectId;
}
const startExport = (t: T, anonId: string, projectId: Id<"projects">, requestId = "r") =>
  t.withIdentity(ALICE).mutation(api.pipeline.startExport, { anonId, projectId, aspect: "9:16", requestId });

describe("deleting an edit for good covers presence, notifications and usage", () => {
  it("removes presence rows and notifications; the claim audit log stays", async () => {
    const t = mk();
    await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    await t.mutation(internal.flags.set, { key: "ready_email", enabled: true });
    const p = await seed(t, ANON, 20_000, true);
    await t.withIdentity(ALICE).mutation(api.account.claim, { anonId: ANON });
    const jobId = await startExport(t, ANON, p);
    await t.run((ctx) => ctx.db.patch(jobId, { status: "succeeded", output: { durationMs: 20_000 } }));
    await t.mutation(internal.notify.onExportDone, { jobId });
    await t.withIdentity(ALICE).mutation(api.presence.beat, { anonId: ANON, projectId: p });
    expect(await t.run((ctx) => ctx.db.query("notifications").collect())).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.query("presence").collect())).toHaveLength(1);

    await t.withIdentity(ALICE).mutation(api.projects.remove, { projectId: p });
    await t.finishAllScheduledFunctions(() => {});
    expect(await t.run((ctx) => ctx.db.query("notifications").collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("presence").collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("accountClaims").collect())).toHaveLength(1);
  });

  it("a render that finishes after the delete records no notification and never throws", async () => {
    const t = mk();
    await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    await t.mutation(internal.flags.set, { key: "ready_email", enabled: true });
    const { token } = await t.mutation(internal.workers.register, { name: "w", provider: "cpu" });
    const workerId = (await t.mutation(internal.workers.touch, { tokenHash: await sha(token) }))!;
    const p = await seed(t, ANON);
    await startExport(t, ANON, p);
    const job = await t.mutation(internal.jobs.claim, { workerId, types: ["render"] });
    expect(job).not.toBeNull();
    await t.withIdentity(ALICE).mutation(api.projects.remove, { projectId: p }); // deleted mid-render: a canceled shell remains
    const done = await t.mutation(internal.jobs.complete, {
      workerId,
      jobId: job!.id,
      output: { mediaId: "x", contentType: "video/mp4", durationMs: 20_000, qc: { freezes: 0, silentAudio: false, lufs: -14 } },
    });
    expect(done.ok).toBe(false); // stale lease
    await t.finishAllScheduledFunctions(() => {});
    expect(await t.run((ctx) => ctx.db.query("notifications").collect())).toHaveLength(0);
    // the hooks are no-ops, not throws, for anything that is gone
    const gone = job!.id as unknown as Id<"jobs">;
    await expect(t.mutation(internal.notify.onExportDone, { jobId: gone })).resolves.toBeNull();
    await expect(t.mutation(internal.entitlements.recordExportDone, { jobId: gone })).resolves.toBeNull();
    await expect(t.withIdentity(ALICE).mutation(api.presence.beat, { anonId: ANON, projectId: p })).resolves.toBeNull();
  });

  it("usage of a render that succeeded before the delete is still counted; a canceled shell counts nothing", async () => {
    const t = mk();
    await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    const p = await seed(t, ANON);
    const jobId = await startExport(t, ANON, p);
    await t.run((ctx) => ctx.db.patch(jobId, { status: "succeeded", output: { durationMs: 120_000 } }));
    await t.withIdentity(ALICE).mutation(api.projects.remove, { projectId: p }); // before recordExportDone ran
    await t.finishAllScheduledFunctions(() => {});
    expect((await t.withIdentity(ALICE).query(api.entitlements.mine, {})).minutesUsed).toBe(2);

    const p2 = await seed(t, ANON2);
    const j2 = await startExport(t, ANON2, p2, "r2");
    await t.run((ctx) => ctx.db.patch(j2, { status: "running" }));
    await t.withIdentity(ALICE).mutation(api.projects.remove, { projectId: p2 });
    expect((await t.withIdentity(ALICE).query(api.entitlements.mine, {})).minutesUsed).toBe(2);
  });
});
