import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "./_generated/server";
import type { Doc } from "./_generated/dataModel";
import { FREE_CPU_JOB_TYPES, isGpuJobType, isGpuWorkerProvider, JOB_TYPES } from "@eyelore/core";
import { sha256Hex } from "./lib/workerAuth";
import { refreshSpend, spendState } from "./lib/spend";

/**
 * Scale-to-zero workers (ADR 0010, GPU pool ADR 0013). Nothing runs while the queue is empty. When a job is waiting and
 * no worker of its pool has polled lately, Convex calls that pool's wake URL once; the worker starts, drains the queue
 * and exits after a few idle minutes. Still pull-based and outbound-only for the worker: the wake call carries no job,
 * only "come and look".
 *
 * Two pools, each with its own URL, liveness and debounce, so a busy CPU worker never stops the GPU being woken:
 *   cpu: EYELORE_WAKE_URL      (printed by `modal deploy services/engine/deploy/modal_app.py`), wakes provider "modal"
 *   gpu: EYELORE_GPU_WAKE_URL  (printed by `modal deploy services/engine/deploy/modal_gpu_app.py`), wakes "modal-gpu"
 * Unset = nothing to wake (a worker that is simply left running); the result is recorded as "not configured".
 */

export type Pool = "cpu" | "gpu";

/** a worker that polled this recently is up: it will see the job by itself */
export const LIVE_WINDOW_MS = 15_000;
/** one wake call per cold start, not one per job */
export const WAKE_DEBOUNCE_MS = 45_000;

const POOL = {
  cpu: { env: "EYELORE_WAKE_URL", wakeProvider: "modal", types: [...FREE_CPU_JOB_TYPES] as string[] },
  gpu: { env: "EYELORE_GPU_WAKE_URL", wakeProvider: "modal-gpu", types: JOB_TYPES.filter((t) => isGpuJobType(t)) as string[] },
} as const;

const inPool = (pool: Pool, provider: string) => (pool === "gpu") === isGpuWorkerProvider(provider);

/** The proof sent to the host: derived from the worker token's stored hash, so there is no second secret to manage. */
export async function wakeKey(tokenHash: string): Promise<string> {
  return await sha256Hex("wake:" + tokenHash);
}

/** Call after enqueueing: decides now, and once more shortly after in case a worker was just about to exit. */
export async function requestWake(ctx: MutationCtx) {
  await ctx.scheduler.runAfter(0, internal.wake.check, {});
  await ctx.scheduler.runAfter(LIVE_WINDOW_MS + 5_000, internal.wake.check, {});
}

/** Live (recently polling, enabled) workers of a pool. */
export async function liveWorkers(ctx: QueryCtx, pool: Pool, now = Date.now()): Promise<Doc<"workers">[]> {
  const workers = await ctx.db.query("workers").order("desc").take(100);
  return workers.filter((w) => !w.disabled && inPool(pool, w.provider) && w.lastSeenAt && now - w.lastSeenAt < LIVE_WINDOW_MS);
}

async function queuedIn(ctx: QueryCtx, pool: Pool) {
  for (const t of POOL[pool].types) {
    const j = await ctx.db.query("jobs").withIndex("by_status_type_created", (q) => q.eq("status", "queued").eq("type", t)).first();
    if (j) return true;
  }
  return false;
}

type Verdict = { wake: boolean; why: string };

async function checkPool(ctx: MutationCtx, pool: Pool, now: number): Promise<Verdict> {
  if (!(await queuedIn(ctx, pool))) return { wake: false, why: "nothing queued" };
  if ((await liveWorkers(ctx, pool, now)).length) return { wake: false, why: "a worker is polling" };
  const state = await ctx.db.query("engineState").first();
  // daily spend guard: over today's cap, this pool is not woken (and says why); it resets with the next UTC day
  const spend = await spendState(ctx, pool, now);
  if (spend.capped) {
    const result = `capped · about $${spend.usd.toFixed(2)} of $${spend.cap.toFixed(2)} today · not waking until tomorrow (UTC)`;
    const field = pool === "gpu" ? "gpuLastWakeResult" : "lastWakeResult";
    if (state) {
      if (state[field] !== result) await ctx.db.patch(state._id, { [field]: result });
    } else await ctx.db.insert("engineState", { lastWakeAt: 0, [field]: result });
    return { wake: false, why: "daily cap reached" };
  }
  const last = pool === "gpu" ? state?.gpuLastWakeAt : state?.lastWakeAt;
  if (last !== undefined && now - last < WAKE_DEBOUNCE_MS) return { wake: false, why: "just asked" };
  const patch = pool === "gpu" ? { gpuLastWakeAt: now, gpuLastWakeResult: "asking" } : { lastWakeAt: now, lastWakeResult: "asking" };
  if (state) await ctx.db.patch(state._id, patch);
  else await ctx.db.insert("engineState", { lastWakeAt: pool === "gpu" ? 0 : now, ...patch });
  await ctx.scheduler.runAfter(0, internal.wake.call, { pool });
  return { wake: true, why: "queued job, no worker" };
}

/** Wake each pool if (and only if) its jobs are waiting, none of its workers is polling, and we haven't just asked. */
export const check = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    await refreshSpend(ctx, now); // the daily spend figures every guard reads (convex/lib/spend.ts)
    const cpu = await checkPool(ctx, "cpu", now);
    const gpu = await checkPool(ctx, "gpu", now);
    if (cpu.why !== "nothing queued" || gpu.why === "nothing queued") return cpu;
    return { ...gpu, pool: "gpu" as const };
  },
});

/** Wake keys of the registered workers on a pool's wake-able host (newest first). */
export const keys = internalQuery({
  args: { pool: v.optional(v.union(v.literal("cpu"), v.literal("gpu"))) },
  handler: async (ctx, { pool }) => {
    const provider = POOL[pool ?? "cpu"].wakeProvider;
    const workers = (await ctx.db.query("workers").order("desc").take(100)).filter((w) => !w.disabled && w.provider === provider).slice(0, 5);
    return await Promise.all(workers.map((w) => wakeKey(w.tokenHash)));
  },
});

export const record = internalMutation({
  args: { result: v.string(), ms: v.optional(v.number()), pool: v.optional(v.union(v.literal("cpu"), v.literal("gpu"))) },
  handler: async (ctx, { result, ms, pool }) => {
    const state = await ctx.db.query("engineState").first();
    if (!state) return;
    if (pool === "gpu") await ctx.db.patch(state._id, { gpuLastWakeResult: result.slice(0, 160), gpuLastWakeMs: ms });
    else await ctx.db.patch(state._id, { lastWakeResult: result.slice(0, 160), lastWakeMs: ms });
  },
});

export const call = internalAction({
  args: { pool: v.optional(v.union(v.literal("cpu"), v.literal("gpu"))) },
  handler: async (ctx, { pool: p }) => {
    const pool: Pool = p ?? "cpu";
    const env = POOL[pool].env;
    const url = process.env[env];
    if (!url) return void (await ctx.runMutation(internal.wake.record, { pool, result: `not configured · set ${env}` }));
    const candidates: string[] = await ctx.runQuery(internal.wake.keys, { pool });
    if (!candidates.length) return void (await ctx.runMutation(internal.wake.record, { pool, result: "no wake-able worker registered" }));
    const t0 = Date.now();
    try {
      const res = await fetch(url, { method: "POST", headers: { "x-eyelore-wake": candidates.join(",") } });
      const body = (await res.text()).slice(0, 80);
      await ctx.runMutation(internal.wake.record, { pool, result: res.ok ? `ok · ${body}` : `refused · ${res.status} ${body}`, ms: Date.now() - t0 });
    } catch (e) {
      await ctx.runMutation(internal.wake.record, { pool, result: `failed · ${e instanceof Error ? e.message : "network"}`, ms: Date.now() - t0 });
    }
  },
});

/** How the last wake of a pool went, in the three words the editor uses. */
export function wakeWord(result: string | undefined, asked: boolean): "asked" | "none" | "failing" | null {
  if (!asked) return null;
  const r = result ?? "";
  return r.startsWith("ok") || r === "asking" ? "asked" : r.startsWith("not configured") || r.startsWith("no wake-able") || r.startsWith("capped") ? "none" : "failing";
}
