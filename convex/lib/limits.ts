import { ConvexError } from "convex/values";
import { verifyClientHint } from "@eyelore/core";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import { anonHashOf } from "./entitle";
import { flagOn } from "./flags";

/**
 * Cost controls (mvp-spec "Low-cost architecture", Phase 3). Everything here runs on the server; the client only
 * shows the message. Numbers are the spec's: Free 60 s and 200 MB, Pro 5 min.
 */
export const FREE_CLIP_MS = 60_000;
export const PRO_CLIP_MS = 5 * 60_000;
export const FREE_MAX_BYTES = 200 * 1024 * 1024;
/** Pro has no spec'd size cap; this is a sanity bound (Convex storage accepts far more, but we pay for it) */
export const PRO_MAX_BYTES = 1024 * 1024 * 1024;
export const DEFAULT_FREE_DAILY_JOBS = 300;

export const MSG = {
  clipLong: "free clips are up to 60 s · trim it or request pro",
  clipLongPro: "clips are up to 5 min · trim it and try again",
  fileBig: "free files are up to 200 MB · compress or trim it, or request pro",
  fileBigPro: "files are up to 1 GB · compress or trim it and try again",
  fileUnknown: "we couldn't read that upload · drop it again",
  busy: "one edit at a time on free · wait for this one to finish or request pro",
  paused: "free edits are paused for today · back tomorrow",
  slowDown: "you're going a bit fast · try again in a few minutes",
} as const;

export const refuse = (message: string): never => {
  throw new ConvexError(message);
};

export const dayKey = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/** Daily cap of free server jobs per UTC day. Env-configurable; unset or a bad value falls back to the default. */
export function freeDailyCap(): number {
  const raw = process.env.EYELORE_FREE_DAILY_JOBS;
  if (raw === undefined || raw.trim() === "") return DEFAULT_FREE_DAILY_JOBS;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? Math.floor(n) : DEFAULT_FREE_DAILY_JOBS;
}

export type FreeState = { paused: boolean; reason: "flag" | "cap" | null; used: number; cap: number; day: string };

/** Is free work open right now? Reads the `free_paused` flag and today's counter. */
export async function freeState(ctx: QueryCtx | MutationCtx, now = Date.now()): Promise<FreeState> {
  const day = dayKey(now);
  const row = await ctx.db.query("dailyUsage").withIndex("by_day", (q) => q.eq("day", day)).unique();
  const used = row?.freeJobs ?? 0;
  const cap = freeDailyCap();
  const flagged = await flagOn(ctx, "free_paused", "global");
  const reason = flagged ? "flag" : used >= cap ? "cap" : null;
  return { paused: reason !== null, reason, used, cap, day };
}

/** Refuse a free job while paused or over today's cap. With `count`, also take one slot of today's budget. */
export async function admitFreeJob(ctx: MutationCtx, opts: { count: boolean }, now = Date.now()): Promise<void> {
  const s = await freeState(ctx, now);
  if (s.paused) refuse(MSG.paused);
  if (!opts.count) return;
  const row = await ctx.db.query("dailyUsage").withIndex("by_day", (q) => q.eq("day", s.day)).unique();
  if (row) await ctx.db.patch(row._id, { freeJobs: row.freeJobs + 1 });
  else await ctx.db.insert("dailyUsage", { day: s.day, freeJobs: 1 });
}

// ───────────── rate limits ─────────────

const HOUR_MS = 60 * 60 * 1000;
/** Per-hour limits by action: [per anonymous session, per client hint]. A hint is shared by everyone behind one IP. */
export const RATE_LIMITS = {
  create: [20, 40],
  uploadUrl: [40, 80],
  access: [6, 12],
} as const;
export type RateAction = keyof typeof RATE_LIMITS;

async function hit(ctx: MutationCtx, key: string, limit: number, now: number) {
  const windowStart = Math.floor(now / HOUR_MS) * HOUR_MS;
  const row = await ctx.db.query("rateLimits").withIndex("by_key", (q) => q.eq("key", key)).unique();
  if (!row || row.windowStart !== windowStart) {
    if (row) await ctx.db.patch(row._id, { windowStart, count: 1 });
    else await ctx.db.insert("rateLimits", { key, windowStart, count: 1 });
    return;
  }
  if (row.count >= limit) refuse(MSG.slowDown);
  await ctx.db.patch(row._id, { count: row.count + 1 });
}

/**
 * Count one `action` against the caller's anonymous session and, when a valid signed hint came along, against the
 * client hint too (fixed one-hour windows). Throws a one-line refusal when either is over. Best effort by design:
 * a caller who skips the hint is only limited per session (see docs/rate-limiting.md).
 */
export async function rateLimit(ctx: MutationCtx, action: RateAction, who: { anonId?: string; clientHint?: string }, now = Date.now()): Promise<void> {
  const [perAnon, perHint] = RATE_LIMITS[action];
  if (who.anonId) await hit(ctx, `${action}:anon:${await anonHashOf(who.anonId)}`, perAnon, now);
  const hash = await verifyClientHint(who.clientHint, process.env.EYELORE_HINT_SECRET);
  if (hash) await hit(ctx, `${action}:hint:${hash}`, perHint, now);
}

/** The size and length caps as a pure function: the message to refuse with, or null when the clip is fine. */
export function sourceRefusal(a: { pro: boolean; size: number | undefined; durationMs: number }): string | null {
  if (a.size === undefined) return MSG.fileUnknown;
  if (a.size > (a.pro ? PRO_MAX_BYTES : FREE_MAX_BYTES)) return a.pro ? MSG.fileBigPro : MSG.fileBig;
  if (a.durationMs > (a.pro ? PRO_CLIP_MS : FREE_CLIP_MS)) return a.pro ? MSG.clipLongPro : MSG.clipLong;
  return null;
}
