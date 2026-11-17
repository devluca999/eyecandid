import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { setPlan, upsertUser } from "./lib/users";
import { FREE_MAX_BYTES, MSG, PRO_MAX_BYTES, sourceRefusal, RATE_LIMITS } from "./lib/limits";
import { mintClientHint } from "@eyelore/core";

const modules = import.meta.glob("./**/*.ts");
const ANON = "anon_" + "a".repeat(32);
const ANON2 = "anon_" + "b".repeat(32);

const src = (projectId: any, storageId: any, durationMs = 5000) => ({ anonId: ANON, projectId, storageId, contentType: "video/mp4", w: 640, h: 360, durationMs, source: "upload" as const });
const store = (t: ReturnType<typeof convexTest>) => t.run((ctx) => ctx.storage.store(new Blob(["fake video"], { type: "video/mp4" })));

beforeEach(() => {
  delete process.env.EYELORE_FREE_DAILY_JOBS;
  delete process.env.EYELORE_HINT_SECRET;
});
afterEach(() => vi.useRealTimers());

describe("free caps", () => {
  it("refuses a clip over 60 s with the design-voice line, and takes nothing", async () => {
    const t = convexTest(schema, modules);
    const projectId = await t.mutation(api.projects.create, { anonId: ANON });
    const storageId = await store(t);
    await expect(t.mutation(api.projects.addSource, src(projectId, storageId, 60_001))).rejects.toThrow("free clips are up to 60 s · trim it or request pro");
    expect(await t.run((ctx) => ctx.db.query("jobs").collect())).toHaveLength(0);
    expect(await t.run((ctx) => ctx.db.query("media").collect())).toHaveLength(0);
    // exactly 60 s is fine
    await t.mutation(api.projects.addSource, src(projectId, storageId, 60_000));
  });

  it("checks size from the pure rule: 200 MB free, 1 GB pro, unknown size refused", () => {
    expect(sourceRefusal({ pro: false, size: FREE_MAX_BYTES, durationMs: 1000 })).toBeNull();
    expect(sourceRefusal({ pro: false, size: FREE_MAX_BYTES + 1, durationMs: 1000 })).toBe(MSG.fileBig);
    expect(sourceRefusal({ pro: true, size: FREE_MAX_BYTES + 1, durationMs: 1000 })).toBeNull();
    expect(sourceRefusal({ pro: true, size: PRO_MAX_BYTES + 1, durationMs: 1000 })).toBe(MSG.fileBigPro);
    expect(sourceRefusal({ pro: true, size: 1, durationMs: 300_001 })).toBe(MSG.clipLongPro);
    expect(sourceRefusal({ pro: false, size: undefined, durationMs: 1000 })).toBe(MSG.fileUnknown);
  });

  it("a Pro entitlement gets 5 minutes and skips the one-at-a-time and daily limits", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => setPlan(ctx, await upsertUser(ctx, { clerkId: "user_pro" }), "creator"));
    const pro = t.withIdentity({ subject: "user_pro" });
    const p1 = await pro.mutation(api.projects.create, { anonId: ANON });
    const p2 = await pro.mutation(api.projects.create, { anonId: ANON });
    await pro.mutation(api.projects.addSource, src(p1, await store(t), 240_000));
    await pro.mutation(api.projects.addSource, src(p2, await store(t), 240_000)); // a second job in flight: fine for Pro
    await expect(pro.mutation(api.projects.addSource, src(p2, await store(t), 301_000))).rejects.toThrow(/up to 5 min/);
    expect((await pro.query(api.limits.status, { anonId: ANON })).maxClipMs).toBe(300_000);
  });

  it("allows one in-flight job per anonymous session, and frees up when it ends", async () => {
    const t = convexTest(schema, modules);
    const p1 = await t.mutation(api.projects.create, { anonId: ANON });
    const p2 = await t.mutation(api.projects.create, { anonId: ANON });
    await t.mutation(api.projects.addSource, src(p1, await store(t)));
    await expect(t.mutation(api.projects.addSource, src(p2, await store(t)))).rejects.toThrow(MSG.busy);
    // another session is unaffected
    const other = await t.mutation(api.projects.create, { anonId: ANON2 });
    await t.mutation(api.projects.addSource, { ...src(other, await store(t)), anonId: ANON2 });
    // the first job finishes: the session may start again
    await t.run(async (ctx) => {
      for (const j of await ctx.db.query("jobs").withIndex("by_owner_anon", (q) => q.eq("ownerAnonId", ANON)).collect()) await ctx.db.patch(j._id, { status: "succeeded" });
    });
    await t.mutation(api.projects.addSource, src(p2, await store(t)));
  });
});

describe("daily budget", () => {
  it("the free_paused flag refuses free edits with the pause message and shows in status", async () => {
    const t = convexTest(schema, modules);
    const projectId = await t.mutation(api.projects.create, { anonId: ANON });
    expect((await t.query(api.limits.status, { anonId: ANON })).paused).toBe(false);
    await t.mutation(internal.flags.set, { key: "free_paused", enabled: true });
    const status = await t.query(api.limits.status, { anonId: ANON });
    expect(status).toMatchObject({ paused: true, message: "free edits are paused for today · back tomorrow" });
    // refused before the upload and again at register time
    await expect(t.mutation(api.projects.uploadUrl, { anonId: ANON, projectId })).rejects.toThrow(MSG.paused);
    await expect(t.mutation(api.projects.addSource, src(projectId, await store(t)))).rejects.toThrow(MSG.paused);
    // flag off again: open
    await t.mutation(internal.flags.set, { key: "free_paused", enabled: false });
    await t.mutation(api.projects.addSource, src(projectId, await store(t)));
  });

  it("pauses at the daily cap (EYELORE_FREE_DAILY_JOBS), counted per UTC day", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-17T22:00:00Z"));
    process.env.EYELORE_FREE_DAILY_JOBS = "2";
    const t = convexTest(schema, modules);
    const fin = () => t.run(async (ctx) => { for (const j of await ctx.db.query("jobs").collect()) await ctx.db.patch(j._id, { status: "succeeded" }); });
    for (const anon of [ANON, ANON2]) {
      const p = await t.mutation(api.projects.create, { anonId: anon });
      await t.mutation(api.projects.addSource, { ...src(p, await store(t)), anonId: anon });
      await fin();
    }
    const third = "anon_" + "c".repeat(32);
    const p3 = await t.mutation(api.projects.create, { anonId: third });
    await expect(t.mutation(api.projects.addSource, { ...src(p3, await store(t)), anonId: third })).rejects.toThrow(MSG.paused);
    expect(await t.query(api.limits.status, { anonId: third })).toMatchObject({ paused: true });
    // new UTC day: a fresh budget
    vi.setSystemTime(new Date("2026-11-18T00:00:05Z"));
    expect((await t.query(api.limits.status, { anonId: third })).paused).toBe(false);
    await t.mutation(api.projects.addSource, { ...src(p3, await store(t)), anonId: third });
  });

  it("the default cap is 300 and a bad env value falls back to it", async () => {
    process.env.EYELORE_FREE_DAILY_JOBS = "lots";
    const t = convexTest(schema, modules);
    await t.run((ctx) => ctx.db.insert("dailyUsage", { day: new Date().toISOString().slice(0, 10), freeJobs: 299 }));
    expect((await t.query(api.limits.status, {})).paused).toBe(false);
    await t.run(async (ctx) => { const r = (await ctx.db.query("dailyUsage").first())!; await ctx.db.patch(r._id, { freeJobs: 300 }); });
    expect((await t.query(api.limits.status, {})).paused).toBe(true);
  });

  it("the flag also stops free renders, and never pauses Pro", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => setPlan(ctx, await upsertUser(ctx, { clerkId: "user_pro" }), "creator"));
    await t.mutation(internal.flags.set, { key: "free_paused", enabled: true });
    const pro = t.withIdentity({ subject: "user_pro" });
    expect((await pro.query(api.limits.status, { anonId: ANON })).paused).toBe(false);
    const p = await pro.mutation(api.projects.create, { anonId: ANON });
    await pro.mutation(api.projects.addSource, src(p, await store(t)));
    const free = await t.mutation(api.projects.create, { anonId: ANON2 });
    await expect(t.mutation(api.pipeline.startExport, { anonId: ANON2, projectId: free, aspect: "9:16", requestId: "r1" })).rejects.toThrow(MSG.paused);
  });
});

describe("rate limits", () => {
  it("limits project creation per anonymous session per hour, and resets in the next hour", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-17T10:10:00Z"));
    const t = convexTest(schema, modules);
    for (let i = 0; i < RATE_LIMITS.create[0]; i++) await t.mutation(api.projects.create, { anonId: ANON });
    await expect(t.mutation(api.projects.create, { anonId: ANON })).rejects.toThrow(MSG.slowDown);
    await t.mutation(api.projects.create, { anonId: ANON2 }); // someone else is fine
    vi.setSystemTime(new Date("2026-11-17T11:00:01Z"));
    await t.mutation(api.projects.create, { anonId: ANON });
  });

  it("limits upload URLs per session and access requests per session", async () => {
    const t = convexTest(schema, modules);
    const p = await t.mutation(api.projects.create, { anonId: ANON });
    for (let i = 0; i < RATE_LIMITS.uploadUrl[0]; i++) await t.mutation(api.projects.uploadUrl, { anonId: ANON, projectId: p });
    await expect(t.mutation(api.projects.uploadUrl, { anonId: ANON, projectId: p })).rejects.toThrow(MSG.slowDown);
    // access requests are 3/day per session already; the hourly limit sits above it and still counts
    for (let i = 0; i < 3; i++) await t.mutation(api.access.request, { anonId: ANON2, email: `a${i}@example.com`, note: "", link: "" });
    await expect(t.mutation(api.access.request, { anonId: ANON2, email: "a9@example.com", note: "", link: "" })).rejects.toThrow(/already asked/);
  });

  it("limits per signed client hint across sessions, and ignores a forged or unsigned hint", async () => {
    process.env.EYELORE_HINT_SECRET = "test-secret";
    const t = convexTest(schema, modules);
    const hint = (await mintClientHint("203.0.113.9", "test-secret"))!;
    const [perHint] = [RATE_LIMITS.create[1]];
    for (let i = 0; i < perHint; i++) {
      const anon = "anon_" + i.toString(16).padStart(32, "0");
      await t.mutation(api.projects.create, { anonId: anon, clientHint: hint });
    }
    await expect(t.mutation(api.projects.create, { anonId: "anon_" + "f".repeat(32), clientHint: hint })).rejects.toThrow(MSG.slowDown);
    // a different IP is fine; a forged signature counts for nothing (and so does not block either)
    const other = (await mintClientHint("198.51.100.1", "test-secret"))!;
    await t.mutation(api.projects.create, { anonId: "anon_" + "e".repeat(32), clientHint: other });
    const forged = hint.slice(0, 33) + "0".repeat(16);
    await t.mutation(api.projects.create, { anonId: "anon_" + "d".repeat(32), clientHint: forged });
    // hints are never minted or checked without the secret
    expect(await mintClientHint("203.0.113.9", undefined)).toBeNull();
  });
});

describe("expiry cron", () => {
  const DAY = 24 * 60 * 60 * 1000;
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-11-17T03:17:00Z"));
  });

  async function seed(t: ReturnType<typeof convexTest>) {
    const now = Date.now();
    return await t.run(async (ctx) => {
      const free = await ctx.db.insert("projects", { ownerAnonId: ANON, title: "f", headVersion: 0, stage: "ready", createdAt: now });
      const uid = await upsertUser(ctx, { clerkId: "user_pro" });
      await setPlan(ctx, uid, "creator");
      const pro = await ctx.db.insert("projects", { ownerUserId: uid, title: "p", headVersion: 0, stage: "ready", createdAt: now });
      const mk = async (kind: "source" | "proxy" | "render", ageDays: number, projectId?: any) => {
        const key = await ctx.storage.store(new Blob([kind]));
        const id = await ctx.db.insert("media", { projectId, kind, storage: { provider: "convex", key }, contentType: "video/mp4", createdAt: now - ageDays * DAY });
        return { id, key };
      };
      await ctx.db.insert("editDocs", { projectId: free, version: 1, doc: {} });
      return {
        freeOld: await mk("source", 8, free), freeNew: await mk("source", 6, free), freeProxyOld: await mk("proxy", 8, free),
        proMid: await mk("source", 20, pro), proOld: await mk("source", 31, pro), proProxyMid: await mk("proxy", 10, pro),
        exportOld: await mk("render", 31), exportNew: await mk("render", 29),
        free,
      };
    });
  }

  it("deletes free raw/proxy after 7 days, pro after 30, exports after 30, and keeps edit docs", async () => {
    const t = convexTest(schema, modules);
    const s = await seed(t);
    await t.mutation(internal.expiry.sweep, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const alive = async (m: { id: any; key: any }) => ({ row: !!(await t.run((ctx) => ctx.db.get(m.id))), bytes: !!(await t.run((ctx) => ctx.storage.getUrl(m.key))) });
    for (const gone of [s.freeOld, s.freeProxyOld, s.proOld, s.exportOld]) expect(await alive(gone)).toEqual({ row: false, bytes: false });
    for (const kept of [s.freeNew, s.proMid, s.proProxyMid, s.exportNew]) expect(await alive(kept)).toEqual({ row: true, bytes: true });
    expect(await t.run((ctx) => ctx.db.query("editDocs").collect())).toHaveLength(1);
    expect(await t.run((ctx) => ctx.db.get(s.free))).not.toBeNull();
  });

  it("does bounded work per run: a small batch pages through and finishes via the scheduler", async () => {
    const t = convexTest(schema, modules);
    await seed(t);
    const first = await t.mutation(internal.expiry.sweep, { batch: 1 });
    expect(first.done).toBe(false);
    expect(first.deleted).toBeLessThanOrEqual(1);
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    const left = await t.run((ctx) => ctx.db.query("media").collect());
    expect(left.map((m) => m.createdAt).sort()).toHaveLength(4);
  });

  it("sweeps stale rate-limit counters", async () => {
    const t = convexTest(schema, modules);
    await t.run(async (ctx) => {
      await ctx.db.insert("rateLimits", { key: "create:anon:x", windowStart: Date.now() - 3 * DAY, count: 5 });
      await ctx.db.insert("rateLimits", { key: "create:anon:y", windowStart: Date.now(), count: 1 });
    });
    await t.mutation(internal.expiry.sweep, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await t.run((ctx) => ctx.db.query("rateLimits").collect())).map((r) => r.key)).toEqual(["create:anon:y"]);
  });
});
