import { FREE_CPU_JOB_TYPES, isGpuJobType, JOB_TYPES, parseRate } from "@eyelore/core";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/**
 * Daily worker spend guard. Convex cannot read the Modal bill, so this is an estimate, priced per pool from the
 * rates the owner copies from modal.com/pricing. Convex does not see worker containers start or stop, only jobs, so:
 *   - a pool's busy time is the seconds its jobs ran today (startedAt..finishedAt, clipped to the UTC day; a job
 *     still running counts up to now);
 *   - jobs closer together than the pool's idle window share one worker run, and each run adds one idle tail
 *     (the worker sits idle that long before it exits). A run that never saw a job (a missed wake) is not seen;
 *   - the CPU safety-net schedule adds one idle tail per interval elapsed today (EYELORE_SAFETY_NET_HOURS).
 * It under-counts cold starts and over-counts a safety-net run that overlapped a busy run; both are small next to
 * the cap. The stored figure is refreshed by `wake.check` (every minute), so a limit trips within about a minute.
 */
export type SpendPool = "cpu" | "gpu";

export const DEFAULT_CPU_USD_PER_HOUR = 0.253;
export const DEFAULT_GPU_USD_PER_HOUR = 1.15;
export const DEFAULT_CPU_DAILY_USD_CAP = 1.0;
export const DEFAULT_GPU_DAILY_USD_CAP = 2.0;
export const DEFAULT_CPU_IDLE_S = 180;
export const DEFAULT_GPU_IDLE_S = 60;
export const DEFAULT_SAFETY_NET_HOURS = 6;
/** jobs are read from the day's start minus this, so one that was queued a while before it ran is still found */
const LOOKBACK_MS = 60 * 60 * 1000;
const ROW_LIMIT = 500;

export const GPU_RESTING = "the gpu is resting for today · back tomorrow";

/** UTC day key; same as `dayKey` in limits.ts (not imported: limits.ts imports this file). */
const dayOf = (ms: number) => new Date(ms).toISOString().slice(0, 10);

const num = (raw: string | undefined, fallback: number) => {
  if (raw === undefined || raw.trim() === "") return fallback;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : fallback;
};

export const usdPerHour = (pool: SpendPool) =>
  pool === "gpu"
    ? (parseRate(process.env.EYELORE_GPU_USD_PER_HOUR) ?? DEFAULT_GPU_USD_PER_HOUR)
    : (parseRate(process.env.EYELORE_CPU_USD_PER_HOUR) ?? DEFAULT_CPU_USD_PER_HOUR);

/** Daily cap in USD. 0 is a valid cap (the pool never wakes); unset or a bad value falls back to the default. */
export const dailyCapUsd = (pool: SpendPool) =>
  pool === "gpu"
    ? num(process.env.EYELORE_GPU_DAILY_USD_CAP, DEFAULT_GPU_DAILY_USD_CAP)
    : num(process.env.EYELORE_WORKER_DAILY_USD_CAP, DEFAULT_CPU_DAILY_USD_CAP);

/** Idle window of the pool's worker: keep in step with EYELORE_IDLE_EXIT_S / EYELORE_GPU_IDLE_EXIT_S on Modal. */
export const idleSeconds = (pool: SpendPool) =>
  pool === "gpu" ? num(process.env.EYELORE_GPU_IDLE_EXIT_S, DEFAULT_GPU_IDLE_S) : num(process.env.EYELORE_IDLE_EXIT_S, DEFAULT_CPU_IDLE_S);

export const safetyNetHours = () => num(process.env.EYELORE_SAFETY_NET_HOURS, DEFAULT_SAFETY_NET_HOURS);

export type Span = { startedAt?: number; finishedAt?: number };

/** Pure: estimated worker seconds (busy + idle tails + safety-net runs) for one pool on the UTC day containing `now`. */
export function estimateSeconds(a: { spans: Span[]; now: number; idleS: number; safetyNetHours: number }): number {
  const dayStart = Date.parse(dayOf(a.now));
  const idleMs = a.idleS * 1000;
  const iv = a.spans
    .filter((s) => s.startedAt !== undefined)
    .map((s) => [Math.max(s.startedAt!, dayStart), Math.min(s.finishedAt ?? a.now, a.now)] as [number, number])
    .filter(([s, e]) => e > s)
    .sort((x, y) => x[0] - y[0]);
  let ms = 0;
  let cur: [number, number] | null = null;
  for (const [s, e] of iv) {
    if (cur && s - cur[1] <= idleMs) cur[1] = Math.max(cur[1], e);
    else {
      if (cur) ms += cur[1] - cur[0] + idleMs;
      cur = [s, e];
    }
  }
  if (cur) ms += cur[1] - cur[0] + idleMs;
  if (a.safetyNetHours > 0) ms += Math.floor((a.now - dayStart) / (a.safetyNetHours * 3_600_000)) * idleMs;
  return ms / 1000;
}

async function spansFor(ctx: QueryCtx | MutationCtx, pool: SpendPool, now: number): Promise<Span[]> {
  const since = Date.parse(dayOf(now)) - LOOKBACK_MS;
  const types = pool === "gpu" ? JOB_TYPES.filter((t) => isGpuJobType(t)) : [...FREE_CPU_JOB_TYPES];
  const spans: Span[] = [];
  for (const type of types)
    for (const status of ["succeeded", "failed", "running"] as const)
      spans.push(...(await ctx.db.query("jobs").withIndex("by_status_type_created", (q) => q.eq("status", status).eq("type", type).gte("createdAt", since)).take(ROW_LIMIT)));
  return spans;
}

/** Estimated USD spent by a pool today, computed from the jobs table. */
export async function computeSpendUsd(ctx: QueryCtx | MutationCtx, pool: SpendPool, now = Date.now()): Promise<number> {
  const seconds = estimateSeconds({ spans: await spansFor(ctx, pool, now), now, idleS: idleSeconds(pool), safetyNetHours: pool === "cpu" ? safetyNetHours() : 0 });
  return (seconds / 3600) * usdPerHour(pool);
}

/** Recompute both pools and store today's figures on the dailyUsage row (called by `wake.check`, every minute). */
export async function refreshSpend(ctx: MutationCtx, now = Date.now()): Promise<{ cpuUsd: number; gpuUsd: number }> {
  const day = dayOf(now);
  const cpuUsd = await computeSpendUsd(ctx, "cpu", now);
  const gpuUsd = await computeSpendUsd(ctx, "gpu", now);
  const row = await ctx.db.query("dailyUsage").withIndex("by_day", (q) => q.eq("day", day)).unique();
  const patch = { cpuSpendUsd: cpuUsd, gpuSpendUsd: gpuUsd, spendAt: now };
  if (row) await ctx.db.patch(row._id, patch);
  else await ctx.db.insert("dailyUsage", { day, freeJobs: 0, ...patch });
  return { cpuUsd, gpuUsd };
}

export type SpendState = { pool: SpendPool; usd: number; cap: number; capped: boolean; day: string; at: number | null };

/** Today's stored estimate against the cap. Cheap (one indexed read); a new UTC day has no row, so it starts at zero. */
export async function spendState(ctx: QueryCtx | MutationCtx, pool: SpendPool, now = Date.now()): Promise<SpendState> {
  const day = dayOf(now);
  const row = await ctx.db.query("dailyUsage").withIndex("by_day", (q) => q.eq("day", day)).unique();
  const usd = (pool === "gpu" ? row?.gpuSpendUsd : row?.cpuSpendUsd) ?? 0;
  const cap = dailyCapUsd(pool);
  return { pool, usd, cap, capped: usd >= cap, day, at: row?.spendAt ?? null };
}
