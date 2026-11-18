import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";
import { failureRateVerdict } from "./sentry";

const modules = import.meta.glob("./**/*.ts");
const NOW = 1_800_000_000_000;
const MIN = 60_000;

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("failureRateVerdict", () => {
  it("never alerts below minJobs", () => {
    expect(failureRateVerdict({ succeeded: 0, failed: 3 })).toEqual({ rate: 1, alert: false });
    expect(failureRateVerdict({ succeeded: 10, failed: 9 }).alert).toBe(false);
    expect(failureRateVerdict({ succeeded: 0, failed: 0 })).toEqual({ rate: 0, alert: false });
  });
  it("exactly 5% does not alert; above does", () => {
    expect(failureRateVerdict({ succeeded: 19, failed: 1 })).toEqual({ rate: 0.05, alert: false });
    expect(failureRateVerdict({ succeeded: 18, failed: 2 }).alert).toBe(true);
  });
  it("honours custom options", () => {
    expect(failureRateVerdict({ succeeded: 3, failed: 1 }, { minJobs: 4, threshold: 0.2 }).alert).toBe(true);
  });
});

type Status = "queued" | "succeeded" | "failed" | "canceled";
let n = 0;
function job(status: Status, finishedAt?: number) {
  return {
    type: "hello", version: 1, idempotencyKey: `k${n++}`, input: {}, status, progress: 0, stage: "x",
    attempts: 0, maxAttempts: 3, createdAt: NOW - 5 * MIN, ...(finishedAt === undefined ? {} : { finishedAt }),
  };
}

async function seed(t: ReturnType<typeof convexTest>, succeeded: number, failed: number) {
  await t.run(async (ctx) => {
    for (let i = 0; i < succeeded; i++) await ctx.db.insert("jobs", job("succeeded", NOW - 10 * MIN));
    for (let i = 0; i < failed; i++) await ctx.db.insert("jobs", job("failed", NOW - 20 * MIN));
    await ctx.db.insert("jobs", job("failed", NOW - 90 * MIN)); // too old
    await ctx.db.insert("jobs", job("succeeded", NOW - 61 * MIN)); // too old
    await ctx.db.insert("jobs", job("canceled", NOW - 5 * MIN)); // neither
    await ctx.db.insert("jobs", job("queued")); // unfinished
  });
}

describe("failure rate counting and alert", () => {
  it("counts only succeeded and failed that finished in the last 60 minutes", async () => {
    const t = convexTest(schema, modules);
    await seed(t, 4, 2);
    expect(await t.query(internal.sentry.recentOutcomes, { now: NOW })).toEqual({ succeeded: 4, failed: 2 });
  });

  it("sends one event with the rate in the message when over threshold and a DSN is set", async () => {
    vi.stubEnv("SENTRY_DSN", "https://abc123@o1.ingest.sentry.io/42");
    const fetchMock = vi.fn(async () => new Response("{}", { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const t = convexTest(schema, modules);
    await seed(t, 44, 6);
    const res = await t.action(internal.sentry.failureRate, {});
    expect(res).toMatchObject({ alert: true, sent: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    const event = String(init.body).split("\n").map((l) => JSON.parse(l))[2];
    expect(event).toMatchObject({
      level: "error",
      message: "job failure rate 12% in the last hour (6 of 50)",
      tags: { failed: "6", succeeded: "44" },
      fingerprint: ["job failure rate"],
    });
  });

  it("sends nothing without a DSN, or when under minJobs", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    const t = convexTest(schema, modules);
    await seed(t, 44, 6);
    expect(await t.action(internal.sentry.failureRate, {})).toMatchObject({ alert: true, sent: false });
    vi.stubEnv("SENTRY_DSN", "https://abc123@o1.ingest.sentry.io/42");
    const small = convexTest(schema, modules);
    await seed(small, 0, 3);
    expect(await small.action(internal.sentry.failureRate, {})).toMatchObject({ alert: false, sent: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
