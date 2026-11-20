import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { enqueueJob } from "./jobs";
import { estimateSeconds, GPU_RESTING, spendState } from "./lib/spend";
import { MSG } from "./lib/limits";

const modules = import.meta.glob("./**/*.ts");
const ANON = "anon_" + "c".repeat(32);
const NOON = Date.UTC(2026, 10, 19, 12);
const HOUR = 3_600_000;

type T = ReturnType<typeof convexTest>;
/** a finished job that ran for `ms`, ending `endedAgo` before now */
const ran = (t: T, type: string, ms: number, endedAgo = 0, key = Math.random().toString()) =>
  t.run((ctx) =>
    ctx.db.insert("jobs", {
      type, version: 1, idempotencyKey: key, input: {}, status: "succeeded", progress: 1, stage: "done", attempts: 1, maxAttempts: 2,
      createdAt: Date.now() - endedAgo - ms, startedAt: Date.now() - endedAgo - ms, finishedAt: Date.now() - endedAgo,
    }),
  );
const queuedHello = (t: T) => t.mutation(api.jobs.enqueueHello, { anonId: ANON, message: "hi", requestId: Math.random().toString() });
const queuedStill = (t: T, key = "q1") =>
  t.run((ctx) => ctx.db.insert("jobs", { type: "still", version: 1, idempotencyKey: key, input: { prompt: "p", refMediaIds: [], w: 720, h: 1280 }, status: "queued", progress: 0, stage: "queued", attempts: 0, maxAttempts: 2, createdAt: Date.now() }));
const state = (t: T) => t.run((ctx) => ctx.db.query("engineState").first());

describe("estimateSeconds", () => {
  it("adds one idle tail per run; jobs inside the idle window share a run", () => {
    const now = NOON;
    const spans = [
      { startedAt: now - 3000_000, finishedAt: now - 2900_000 },
      { startedAt: now - 2800_000, finishedAt: now - 2700_000 }, // 100 s gap < 180 s: same run
      { startedAt: now - 1000_000, finishedAt: now - 900_000 }, // new run
    ];
    expect(estimateSeconds({ spans, now, idleS: 180, safetyNetHours: 0 })).toBe(300 + 180 + 100 + 180);
  });
  it("clips to the UTC day and counts a safety-net run per elapsed interval", () => {
    const spans = [{ startedAt: NOON - 13 * HOUR, finishedAt: NOON - 11 * HOUR }]; // 1 h of it is yesterday
    expect(estimateSeconds({ spans, now: NOON, idleS: 180, safetyNetHours: 6 })).toBe(3600 + 180 + 2 * 180);
  });
});

describe("daily worker spend guard", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOON);
    vi.stubEnv("EYELORE_WAKE_URL", "https://wake.example/wake");
    vi.stubEnv("EYELORE_GPU_WAKE_URL", "https://gpu.example/wake");
    vi.stubEnv("EYELORE_SAFETY_NET_HOURS", "0");
    vi.stubEnv("EYELORE_WORKER_DAILY_USD_CAP", "1");
    vi.stubEnv("EYELORE_GPU_DAILY_USD_CAP", "2");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("under the cap, a queued job still wakes the worker", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.workers.register, { name: "modal", provider: "modal" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
    await ran(t, "transcribe", 10 * 60_000); // ~$0.05
    await queuedHello(t);
    expect((await t.mutation(internal.wake.check, {})).wake).toBe(true);
    expect((await t.run((ctx) => spendState(ctx, "cpu"))).capped).toBe(false);
  });

  it("over the cap, the pool is not woken, says why, and free edits get the paused refusal", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.workers.register, { name: "modal", provider: "modal" });
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await ran(t, "render", 4 * HOUR); // 4 h × $0.253 > $1
    await queuedHello(t);
    expect(await t.mutation(internal.wake.check, {})).toEqual({ wake: false, why: "daily cap reached" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await state(t))?.lastWakeResult).toMatch(/^capped · about \$1\.0\d of \$1\.00 today/);
    expect(await t.query(api.limits.status, { anonId: ANON })).toMatchObject({ paused: true, message: MSG.paused });
  });

  it("resets on the next UTC day", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.workers.register, { name: "modal", provider: "modal" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
    await ran(t, "render", 4 * HOUR);
    await queuedHello(t);
    expect((await t.mutation(internal.wake.check, {})).why).toBe("daily cap reached");
    vi.setSystemTime(Date.UTC(2026, 10, 20, 0, 5)); // the job ended yesterday
    expect((await t.mutation(internal.wake.check, {})).wake).toBe(true);
    expect((await t.query(api.limits.status, { anonId: ANON })).paused).toBe(false);
  });

  it("the gpu and the cpu are capped independently", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.workers.register, { name: "modal", provider: "modal" });
    await t.mutation(internal.workers.register, { name: "modal-gpu", provider: "modal-gpu" });
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await ran(t, "still", 3 * HOUR); // 3 h × $1.15 > $2: gpu capped, cpu untouched
    await queuedStill(t);
    await queuedHello(t);
    const v = await t.mutation(internal.wake.check, {});
    expect(v).toMatchObject({ wake: true }); // the cpu pool still wakes
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock.mock.calls.map((c) => (c as unknown as [string])[0])).toEqual(["https://wake.example/wake"]);
    expect((await state(t))?.gpuLastWakeResult).toMatch(/^capped · /);
    expect(await t.query(api.limits.status, { anonId: ANON })).toMatchObject({ paused: false });
    // a paid gpu request is refused with one line, before any charge
    await expect(t.run((ctx) => enqueueJob(ctx, { type: "still", input: { prompt: "p", refMediaIds: [], w: 720, h: 1280 }, idempotencyKey: "new" }))).rejects.toThrow(GPU_RESTING);
  });

  it("a capped cpu leaves the gpu open", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.workers.register, { name: "modal-gpu", provider: "modal-gpu" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("ok", { status: 200 })));
    await ran(t, "render", 4 * HOUR);
    await queuedStill(t);
    expect(await t.mutation(internal.wake.check, {})).toMatchObject({ wake: true, pool: "gpu" });
    expect(GPU_RESTING).toBe("the gpu is resting for today · back tomorrow");
  });
});
