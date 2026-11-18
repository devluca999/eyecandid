import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { emptyEditDoc } from "@eyelore/core";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/** The free export count (mvp-spec "Access model"): 1 anonymous, then sign-in; 3 a month on Free; Pro unlimited. */

const modules = import.meta.glob("./**/*.ts");
const ANON = "anon_" + "c".repeat(32);
const ALICE = { subject: "user_alice", email: "alice@example.com" };
type T = ReturnType<typeof convexTest>;
const mk = () => convexTest(schema, modules);

afterEach(() => {
  delete process.env.CLERK_JWT_ISSUER_DOMAIN;
  vi.useRealTimers();
});
/** Sign-in switched on: Clerk configured on the deployment and the `accounts` flag on. */
async function signInOn(t: T) {
  process.env.CLERK_JWT_ISSUER_DOMAIN = "https://clerk.example.test";
  await t.mutation(internal.flags.set, { key: "accounts", enabled: true, rolloutPct: 100 });
}

async function seed(t: T, opts: { as?: typeof ALICE; engine?: "device" } = {}) {
  const projectId = await (opts.as ? t.withIdentity(opts.as) : t).mutation(api.projects.create, { anonId: ANON });
  await t.run(async (ctx) => {
    const row = await ctx.db.query("editDocs").withIndex("by_project", (q) => q.eq("projectId", projectId)).unique();
    const doc = emptyEditDoc(projectId);
    doc.clips = [{ id: "c1", mediaId: "m1", source: "upload", w: 640, h: 360, durationMs: 20_000, fps: 30 }];
    doc.beads = [{ id: "b1", clipId: "c1", inMs: 0, outMs: 20_000, words: [], cuts: [], struck: false }] as typeof doc.beads;
    await ctx.db.patch(row!._id, { doc });
    await ctx.db.patch(projectId, { stage: "ready", ...(opts.engine ? { engine: opts.engine } : {}) });
  });
  return projectId;
}
const server = (t: T, projectId: Id<"projects">, requestId: string, as?: typeof ALICE) =>
  (as ? t.withIdentity(as) : t).mutation(api.pipeline.startExport, { anonId: ANON, projectId, aspect: "9:16", requestId });
const device = (t: T, projectId: Id<"projects">, requestId: string, as?: typeof ALICE) =>
  (as ? t.withIdentity(as) : t).mutation(api.pipeline.authorizeDeviceExport, { anonId: ANON, projectId, aspect: "9:16", requestId });
const mine = (t: T, as?: typeof ALICE) => (as ? t.withIdentity(as) : t).query(api.entitlements.mine, { anonId: ANON });
const renders = (t: T) => t.run(async (ctx) => (await ctx.db.query("jobs").collect()).filter((j) => j.type === "render"));

describe("anonymous: one free export", () => {
  it("the second asks for sign-in when sign-in is on, and nothing is counted or queued", async () => {
    const t = mk();
    await signInOn(t);
    const p = await seed(t);
    await server(t, p, "r1");
    expect((await mine(t)).exports).toEqual({ used: 1, limit: 1, scope: "session", signInAvailable: true });
    await expect(server(t, p, "r2")).rejects.toThrow("sign in for 3 free exports a month · your edit comes with you");
    await expect(server(t, p, "r2")).rejects.toThrow(/sign_in_required/);
    expect(await renders(t)).toHaveLength(1);
    expect((await mine(t)).exports.used).toBe(1);
  });

  it("the count is per session, not per edit, and holds on device too", async () => {
    const t = mk();
    await signInOn(t);
    const a = await seed(t, { engine: "device" });
    const b = await seed(t, { engine: "device" });
    await device(t, a, "d1");
    await expect(device(t, b, "d2")).rejects.toThrow(/sign_in_required/);
  });

  it("without sign-in switched on, the export still goes (as before) and the gate is told why", async () => {
    const t = mk();
    const p = await seed(t);
    await server(t, p, "r1");
    await server(t, p, "r2");
    expect((await mine(t)).exports).toEqual({ used: 2, limit: 1, scope: "session", signInAvailable: false });
    // Clerk configured but the accounts flag off: same
    process.env.CLERK_JWT_ISSUER_DOMAIN = "https://clerk.example.test";
    await server(t, p, "r3");
    expect(await renders(t)).toHaveLength(3);
  });

  it("a replayed request (same request id) returns the same export and counts once, on both engines", async () => {
    const t = mk();
    await signInOn(t);
    const p = await seed(t);
    const j1 = await server(t, p, "same");
    expect(await server(t, p, "same")).toBe(j1);
    const d = await seed(t, { engine: "device" });
    await t.run(async (ctx) => {
      for (const c of await ctx.db.query("exportCounts").collect()) await ctx.db.delete(c._id);
    });
    const e1 = await device(t, d, "dev-same");
    const e2 = await device(t, d, "dev-same");
    expect(e2.exportId).toBe(e1.exportId);
    expect((await mine(t)).exports.used).toBe(1);
    expect(await t.run((ctx) => ctx.db.query("exports").collect())).toHaveLength(2);
  });

  it("a server render that fails for good gives the export back, once", async () => {
    const t = mk();
    await signInOn(t);
    const p = await seed(t);
    const jobId = await server(t, p, "r1");
    const { token } = await t.mutation(internal.workers.register, { name: "cpu", provider: "modal" });
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const workerId = (await t.mutation(internal.workers.touch, { tokenHash: [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("") }))!;
    await t.mutation(internal.jobs.claim, { workerId, types: ["render"] });
    await t.mutation(internal.jobs.fail, { workerId, jobId, error: "ffmpeg", retryable: false });
    await t.finishAllScheduledFunctions(() => {});
    expect((await mine(t)).exports.used).toBe(0);
    await t.mutation(internal.pipeline.onJobDone, { jobId }); // a second report changes nothing
    expect((await mine(t)).exports.used).toBe(0);
    await server(t, p, "r2"); // the free export is there again
  });
});

describe("signed in on Free: 3 a calendar month", () => {
  it("the 4th is refused with when they come back; a new month starts again", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-17T12:00:00Z"));
    const t = mk();
    await signInOn(t);
    await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    const p = await seed(t, { as: ALICE });
    for (const r of ["a", "b", "c"]) await server(t, p, r, ALICE);
    expect((await mine(t, ALICE)).exports).toEqual({ used: 3, limit: 3, scope: "month", signInAvailable: true });
    await expect(server(t, p, "d", ALICE)).rejects.toThrow("this month's 3 free exports are used · more on dec 1");
    await expect(server(t, p, "d", ALICE)).rejects.toThrow(/exports_used/);
    vi.setSystemTime(new Date("2026-12-01T00:00:01Z"));
    expect((await mine(t, ALICE)).exports.used).toBe(0);
    await server(t, p, "e", ALICE);
  });

  it("an anonymous export before signing in doesn't use up the account's month", async () => {
    const t = mk();
    await signInOn(t);
    const p = await seed(t);
    await server(t, p, "anon");
    await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    await t.withIdentity(ALICE).mutation(api.account.claim, { anonId: ANON });
    for (const r of ["a", "b", "c"]) await server(t, p, r, ALICE);
    await expect(server(t, p, "d", ALICE)).rejects.toThrow(/exports_used/);
  });
});

describe("Pro: unlimited", () => {
  it("a paid plan exports without a count", async () => {
    const t = mk();
    await signInOn(t);
    const userId = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    const { setPlan } = await import("./lib/users");
    await t.run((ctx) => setPlan(ctx, userId, "creator", { subscriptionStatus: "active" }));
    const p = await seed(t, { as: ALICE });
    for (const r of ["a", "b", "c", "d", "e"]) await server(t, p, r, ALICE);
    expect((await mine(t, ALICE)).exports).toMatchObject({ used: 0, limit: null });
    expect(await t.run((ctx) => ctx.db.query("exportCounts").collect())).toHaveLength(0);
  });
});
