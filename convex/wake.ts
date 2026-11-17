import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery, type MutationCtx } from "./_generated/server";
import { sha256Hex } from "./lib/workerAuth";

/**
 * Scale-to-zero workers (ADR 0010). Nothing runs while the queue is empty. When a job is waiting and no worker has
 * polled lately, Convex calls the host's wake URL once; the worker starts, drains the queue and exits after a few
 * idle minutes. Still pull-based and outbound-only for the worker: the wake call carries no job, only "come and look".
 *
 * Convex env: EYELORE_WAKE_URL (printed by `modal deploy`). Unset = nothing to wake (a laptop or Colab worker that is
 * simply left running); the result is recorded as "not configured" rather than pretended.
 */

/** a worker that polled this recently is up: it will see the job by itself */
export const LIVE_WINDOW_MS = 15_000;
/** one wake call per cold start, not one per job */
export const WAKE_DEBOUNCE_MS = 45_000;

/** The proof sent to the host: derived from the worker token's stored hash, so there is no second secret to manage. */
export async function wakeKey(tokenHash: string): Promise<string> {
  return await sha256Hex("wake:" + tokenHash);
}

/** Call after enqueueing: decides now, and once more shortly after in case a worker was just about to exit. */
export async function requestWake(ctx: MutationCtx) {
  await ctx.scheduler.runAfter(0, internal.wake.check, {});
  await ctx.scheduler.runAfter(LIVE_WINDOW_MS + 5_000, internal.wake.check, {});
}

/** Wake the engine if (and only if) a job is waiting, no worker is polling, and we haven't just asked. */
export const check = internalMutation({
  args: {},
  handler: async (ctx) => {
    const waiting = await ctx.db.query("jobs").withIndex("by_status_type_created", (q) => q.eq("status", "queued")).first();
    if (!waiting) return { wake: false as const, why: "nothing queued" };
    const now = Date.now();
    const workers = await ctx.db.query("workers").order("desc").take(50);
    if (workers.some((w) => !w.disabled && w.lastSeenAt && now - w.lastSeenAt < LIVE_WINDOW_MS)) return { wake: false as const, why: "a worker is polling" };
    const state = await ctx.db.query("engineState").first();
    if (state && now - state.lastWakeAt < WAKE_DEBOUNCE_MS) return { wake: false as const, why: "just asked" };
    if (state) await ctx.db.patch(state._id, { lastWakeAt: now, lastWakeResult: "asking" });
    else await ctx.db.insert("engineState", { lastWakeAt: now, lastWakeResult: "asking" });
    await ctx.scheduler.runAfter(0, internal.wake.call, {});
    return { wake: true as const, why: "queued job, no worker" };
  },
});

/** Wake keys of the registered workers on wake-able hosts (newest first). */
export const keys = internalQuery({
  args: {},
  handler: async (ctx) => {
    const workers = (await ctx.db.query("workers").order("desc").take(50)).filter((w) => !w.disabled && w.provider === "modal").slice(0, 5);
    return await Promise.all(workers.map((w) => wakeKey(w.tokenHash)));
  },
});

export const record = internalMutation({
  args: { result: v.string(), ms: v.optional(v.number()) },
  handler: async (ctx, { result, ms }) => {
    const state = await ctx.db.query("engineState").first();
    if (state) await ctx.db.patch(state._id, { lastWakeResult: result.slice(0, 160), lastWakeMs: ms });
  },
});

export const call = internalAction({
  args: {},
  handler: async (ctx) => {
    const url = process.env.EYELORE_WAKE_URL;
    if (!url) return void (await ctx.runMutation(internal.wake.record, { result: "not configured · set EYELORE_WAKE_URL" }));
    const candidates: string[] = await ctx.runQuery(internal.wake.keys, {});
    if (!candidates.length) return void (await ctx.runMutation(internal.wake.record, { result: "no wake-able worker registered" }));
    const t0 = Date.now();
    try {
      const res = await fetch(url, { method: "POST", headers: { "x-eyelore-wake": candidates.join(",") } });
      const body = (await res.text()).slice(0, 80);
      await ctx.runMutation(internal.wake.record, { result: res.ok ? `ok · ${body}` : `refused · ${res.status} ${body}`, ms: Date.now() - t0 });
    } catch (e) {
      await ctx.runMutation(internal.wake.record, { result: `failed · ${e instanceof Error ? e.message : "network"}`, ms: Date.now() - t0 });
    }
  },
});
