import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { LIVE_WINDOW_MS, WAKE_DEBOUNCE_MS, wakeKey } from "./wake";

const modules = import.meta.glob("./**/*.ts");
const ANON = "anon_" + "b".repeat(32);

async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const state = (t: ReturnType<typeof convexTest>) => t.run((ctx) => ctx.db.query("engineState").first());

describe("wake on demand (scale-to-zero workers)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubEnv("EYELORE_WAKE_URL", "https://wake.example/wake");
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("does nothing while the queue is empty", async () => {
    const t = convexTest(schema, modules);
    expect(await t.mutation(internal.wake.check, {})).toEqual({ wake: false, why: "nothing queued" });
    expect(await state(t)).toBeNull();
  });

  it("a queued job with no worker polling wakes the host once, with the worker's wake key", async () => {
    const t = convexTest(schema, modules);
    const { token } = await t.mutation(internal.workers.register, { name: "modal", provider: "modal" });
    const fetchMock = vi.fn(async () => new Response('{"started":true}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await t.mutation(api.jobs.enqueueHello, { anonId: ANON, message: "hi", requestId: "1" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);

    expect(fetchMock).toHaveBeenCalledTimes(1); // the follow-up check 20s later is debounced
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://wake.example/wake");
    expect((init.headers as Record<string, string>)["x-eyelore-wake"]).toBe(await wakeKey(await sha(token)));
    expect((await state(t))?.lastWakeResult).toMatch(/^ok · /);
    expect((await t.query(api.jobs.workerPresence, {})).wake).toBe("asked");

    // a second job inside the debounce window does not call again
    await t.mutation(api.jobs.enqueueHello, { anonId: ANON, message: "hi", requestId: "2" });
    expect(await t.mutation(internal.wake.check, {})).toEqual({ wake: false, why: "just asked" });
  });

  it("does not wake when a worker polled in the last few seconds, and does once it has gone quiet", async () => {
    const t = convexTest(schema, modules);
    const { token } = await t.mutation(internal.workers.register, { name: "modal", provider: "modal" });
    await t.mutation(internal.workers.touch, { tokenHash: await sha(token) });
    const fetchMock = vi.fn(async () => new Response("ok", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await t.mutation(api.jobs.enqueueHello, { anonId: ANON, message: "hi", requestId: "1" });
    expect(await t.mutation(internal.wake.check, {})).toEqual({ wake: false, why: "a worker is polling" });

    vi.advanceTimersByTime(LIVE_WINDOW_MS + WAKE_DEBOUNCE_MS);
    expect((await t.mutation(internal.wake.check, {})).wake).toBe(true);
  });

  it("asks again after the debounce if the job is still waiting (the minute cron)", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.workers.register, { name: "modal", provider: "modal" });
    vi.stubGlobal("fetch", vi.fn(async () => new Response("busy", { status: 503 })));
    await t.mutation(api.jobs.enqueueHello, { anonId: ANON, message: "hi", requestId: "1" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await state(t))?.lastWakeResult).toMatch(/^refused · 503/);
    expect((await t.query(api.jobs.workerPresence, {})).wake).toBe("failing");
    vi.advanceTimersByTime(WAKE_DEBOUNCE_MS + 1);
    expect((await t.mutation(internal.wake.check, {})).wake).toBe(true);
  });

  it("without EYELORE_WAKE_URL nothing is called and the state says so", async () => {
    vi.stubEnv("EYELORE_WAKE_URL", "");
    const t = convexTest(schema, modules);
    await t.mutation(internal.workers.register, { name: "laptop", provider: "cpu" });
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await t.mutation(api.jobs.enqueueHello, { anonId: ANON, message: "hi", requestId: "1" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).not.toHaveBeenCalled();
    expect((await state(t))?.lastWakeResult).toBe("not configured · set EYELORE_WAKE_URL");
    expect((await t.query(api.jobs.workerPresence, {})).wake).toBe("none");
  });

  it("only workers on a wake-able host get a key sent", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.workers.register, { name: "laptop", provider: "cpu" });
    expect(await t.query(internal.wake.keys, {})).toEqual([]);
  });

  it("workerPresence says whether a cold engine can be woken at all (the landing's honest line)", async () => {
    const t = convexTest(schema, modules);
    expect((await t.query(api.jobs.workerPresence, {})).wakeable).toBe(false); // nothing registered
    await t.mutation(internal.workers.register, { name: "laptop", provider: "cpu" });
    expect((await t.query(api.jobs.workerPresence, {})).wakeable).toBe(false); // a cpu worker has no wake host
    await t.mutation(internal.workers.register, { name: "modal", provider: "modal" });
    expect((await t.query(api.jobs.workerPresence, {})).wakeable).toBe(true);
    vi.stubEnv("EYELORE_WAKE_URL", "");
    expect((await t.query(api.jobs.workerPresence, {})).wakeable).toBe(false); // no wake url
  });

  const queuedStill = (t: ReturnType<typeof convexTest>) =>
    t.run((ctx) =>
      ctx.db.insert("jobs", { type: "still", version: 1, idempotencyKey: "s1", input: { prompt: "p", refMediaIds: [], w: 720, h: 1280 }, status: "queued", progress: 0, stage: "queued", attempts: 0, maxAttempts: 2, createdAt: Date.now() }),
    );

  it("GPU pool: a queued still wakes the GPU host even while a CPU worker polls, and never wakes the CPU host", async () => {
    vi.stubEnv("EYELORE_GPU_WAKE_URL", "https://gpu.example/wake");
    const t = convexTest(schema, modules);
    const cpu = await t.mutation(internal.workers.register, { name: "modal", provider: "modal" });
    const gpu = await t.mutation(internal.workers.register, { name: "modal-gpu", provider: "modal-gpu" });
    await t.mutation(internal.workers.touch, { tokenHash: await sha(cpu.token) }); // the CPU worker is busy polling
    const fetchMock = vi.fn(async () => new Response('{"started":true}', { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    await queuedStill(t);
    expect(await t.mutation(internal.wake.check, {})).toEqual({ wake: true, why: "queued job, no worker", pool: "gpu" });
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://gpu.example/wake");
    expect((init.headers as Record<string, string>)["x-eyelore-wake"]).toBe(await wakeKey(await sha(gpu.token)));
    expect(await t.query(api.jobs.workerPresence, {})).toMatchObject({ live: 1, wake: null, gpu: { live: 0, registered: true, wake: "asked" } });
    expect((await state(t))?.lastWakeResult).toBeUndefined(); // the CPU pool's bookkeeping is untouched
  });

  it("GPU pool without EYELORE_GPU_WAKE_URL says so", async () => {
    vi.stubEnv("EYELORE_GPU_WAKE_URL", "");
    const t = convexTest(schema, modules);
    await t.mutation(internal.workers.register, { name: "modal-gpu", provider: "modal-gpu" });
    vi.stubGlobal("fetch", vi.fn());
    await queuedStill(t);
    await t.mutation(internal.wake.check, {});
    await t.finishAllScheduledFunctions(vi.runAllTimers);
    expect((await state(t))?.gpuLastWakeResult).toBe("not configured · set EYELORE_GPU_WAKE_URL");
    expect((await t.query(api.jobs.workerPresence, {})).gpu.wake).toBe("none");
  });
});
