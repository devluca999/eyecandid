import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const ANON = "anon_" + "a".repeat(32);

async function setup() {
  const t = convexTest(schema, modules);
  const { token } = await t.mutation(internal.workers.register, { name: "w1", provider: "cpu-stub" });
  const workerId = await t.mutation(internal.workers.touch, { tokenHash: await sha(token) });
  return { t, workerId: workerId! };
}
async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

describe("job queue", () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it("round-trips a hello job with live progress", async () => {
    const { t, workerId } = await setup();
    const jobId = await t.mutation(api.jobs.enqueueHello, { anonId: ANON, message: "hi", requestId: "1" });
    const claimed = await t.mutation(internal.jobs.claim, { workerId, types: ["hello"] });
    expect(claimed?.id).toBe(jobId);
    expect(await t.mutation(internal.jobs.progress, { workerId, jobId, progress: 0.4, stage: "thinking" })).toBe(true);
    expect((await t.query(api.jobs.get, { jobId, anonId: ANON }))?.progress).toBe(0.4);
    const r = await t.mutation(internal.jobs.complete, { workerId, jobId, output: { echo: "hi", worker: "w1", provider: "cpu-stub" } });
    expect(r.ok).toBe(true);
    const job = await t.query(api.jobs.get, { jobId, anonId: ANON });
    expect(job?.status).toBe("succeeded");
    expect(job?.output).toEqual({ echo: "hi", worker: "w1", provider: "cpu-stub" });
  });

  it("is idempotent on the idempotency key", async () => {
    const { t } = await setup();
    const a = await t.mutation(api.jobs.enqueueHello, { anonId: ANON, message: "hi", requestId: "same" });
    const b = await t.mutation(api.jobs.enqueueHello, { anonId: ANON, message: "hi", requestId: "same" });
    expect(a).toBe(b);
  });

  it("hides jobs from other owners", async () => {
    const { t } = await setup();
    const jobId = await t.mutation(api.jobs.enqueueHello, { anonId: ANON, message: "hi", requestId: "1" });
    expect(await t.query(api.jobs.get, { jobId, anonId: "anon_" + "b".repeat(32) })).toBeNull();
  });

  it("requeues expired leases, then fails after maxAttempts", async () => {
    const { t, workerId } = await setup();
    const jobId = await t.mutation(api.jobs.enqueueHello, { anonId: ANON, message: "hi", requestId: "1" }); // maxAttempts 2
    for (const expected of ["queued", "failed"]) {
      expect(await t.mutation(internal.jobs.claim, { workerId, types: ["hello"], leaseMs: 5_000 })).not.toBeNull();
      vi.advanceTimersByTime(6_000);
      await t.mutation(internal.jobs.requeueExpired, {});
      expect((await t.query(api.jobs.get, { jobId, anonId: ANON }))?.status).toBe(expected);
    }
  });

  it("rejects a late completion from a worker that lost its lease", async () => {
    const { t, workerId } = await setup();
    const jobId = await t.mutation(api.jobs.enqueueHello, { anonId: ANON, message: "hi", requestId: "1" });
    await t.mutation(internal.jobs.claim, { workerId, types: ["hello"], leaseMs: 5_000 });
    vi.advanceTimersByTime(6_000);
    await t.mutation(internal.jobs.requeueExpired, {});
    const r = await t.mutation(internal.jobs.complete, { workerId, jobId, output: { echo: "hi", worker: "w1", provider: "x" } });
    expect(r.ok).toBe(false);
  });

  it("fails a job whose output breaks the contract", async () => {
    const { t, workerId } = await setup();
    const jobId = await t.mutation(api.jobs.enqueueHello, { anonId: ANON, message: "hi", requestId: "1" });
    await t.mutation(internal.jobs.claim, { workerId, types: ["hello"] });
    const r = await t.mutation(internal.jobs.complete, { workerId, jobId, output: { nope: true } });
    expect(r.ok).toBe(false);
    expect((await t.query(api.jobs.get, { jobId, anonId: ANON }))?.status).toBe("failed");
  });

  it("retries a retryable failure", async () => {
    const { t, workerId } = await setup();
    const jobId = await t.mutation(api.jobs.enqueueHello, { anonId: ANON, message: "hi", requestId: "1" });
    await t.mutation(internal.jobs.claim, { workerId, types: ["hello"] });
    await t.mutation(internal.jobs.fail, { workerId, jobId, error: "oom", retryable: true });
    expect((await t.query(api.jobs.get, { jobId, anonId: ANON }))?.status).toBe("queued");
  });

  it("disabled workers can't authenticate", async () => {
    const t = convexTest(schema, modules);
    const { token } = await t.mutation(internal.workers.register, { name: "gone", provider: "x" });
    await t.mutation(internal.workers.disable, { name: "gone" });
    expect(await t.mutation(internal.workers.touch, { tokenHash: await sha(token) })).toBeNull();
  });

  it("respects the hello_job flag", async () => {
    const { t } = await setup();
    await t.mutation(internal.flags.set, { key: "hello_job", enabled: false });
    await expect(t.mutation(api.jobs.enqueueHello, { anonId: ANON, message: "hi", requestId: "1" })).rejects.toThrow(/off/);
    expect((await t.query(api.flags.forSubject, { subject: ANON })).hello_job).toBe(false);
  });
});

describe("analytics", () => {
  it("never stores the raw anon id", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(api.events.track, { anonId: ANON, event: { name: "landing_view", props: { platform: "web", heroLine: "x" } } });
    const rows = await t.run((ctx) => ctx.db.query("events").collect());
    expect(rows).toHaveLength(1);
    expect(JSON.stringify(rows[0])).not.toContain(ANON);
    expect(rows[0]!.anonHash).toMatch(/^[0-9a-f]{32}$/);
  });
});
