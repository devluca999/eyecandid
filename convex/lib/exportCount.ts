import { ANON_FREE_EXPORTS, FREE_EXPORTS_PER_MONTH, periodKey } from "@eyelore/core";
import type { PlanId } from "@eyelore/core";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { flagOn } from "./flags";
import { anonHashOf } from "./entitle";

/**
 * The free export count (mvp-spec "Access model"): 1 per anonymous session, 3 a calendar month with a free account,
 * unlimited on a paid plan. The rule is `decideExportCount` in core; this is where the count is kept.
 */

/** Can this visitor actually sign in? Clerk is configured on this deployment and the `accounts` flag is on for them. */
export async function signInAvailable(ctx: QueryCtx | MutationCtx, anonId: string | undefined): Promise<boolean> {
  if (!process.env.CLERK_JWT_ISSUER_DOMAIN) return false;
  return await flagOn(ctx, "accounts", anonId ?? "");
}

export type ExportCount = { key?: string; used: number; limit: number | null; scope: "session" | "month"; period: string };

/** The caller's counter: `u:<user>:<month>` signed in, `a:<sha of anon id>` (the session, never reset) otherwise. */
export async function exportCountFor(ctx: QueryCtx | MutationCtx, who: { userId?: Id<"users">; anonId?: string }, plan: PlanId, now = Date.now()): Promise<ExportCount> {
  const period = periodKey(now);
  const key = who.userId ? `u:${who.userId}:${period}` : who.anonId ? `a:${await anonHashOf(who.anonId)}` : undefined;
  const row = key ? await ctx.db.query("exportCounts").withIndex("by_key", (q) => q.eq("key", key)).unique() : null;
  const limit = who.userId ? (plan === "free" ? FREE_EXPORTS_PER_MONTH : null) : ANON_FREE_EXPORTS;
  return { key, used: row?.count ?? 0, limit, scope: who.userId ? "month" : "session", period };
}

export async function bumpExportCount(ctx: MutationCtx, key: string, delta: 1 | -1) {
  const row = await ctx.db.query("exportCounts").withIndex("by_key", (q) => q.eq("key", key)).unique();
  if (row) await ctx.db.patch(row._id, { count: Math.max(0, row.count + delta) });
  else if (delta > 0) await ctx.db.insert("exportCounts", { key, count: 1 });
}

/** A worker render failed for good: the export it was counted as comes back, once. */
export async function giveBackExport(ctx: MutationCtx, jobId: Id<"jobs">) {
  const exp = await ctx.db.query("exports").withIndex("by_job", (q) => q.eq("jobId", jobId)).unique();
  if (!exp?.countKey) return false;
  await bumpExportCount(ctx, exp.countKey, -1);
  await ctx.db.patch(exp._id, { countKey: undefined });
  return true;
}

/** Free exports given back for a failed or blocked on-device render: per anonymous session ever, per Free account per month. */
export const DEVICE_GIVE_BACKS = 1;

/**
 * Give an undelivered on-device export's free count back, capped (DEVICE_GIVE_BACKS per counter) because the browser
 * reports it. Used for a failed render and for one the quality check blocked (convex/qc.ts recordDevice).
 */
export async function giveBackDeviceCount(ctx: MutationCtx, exp: Doc<"exports">): Promise<boolean> {
  if (!exp.device || !exp.countKey) return false;
  const cap = `g:${exp.countKey}`;
  const used = await ctx.db.query("exportCounts").withIndex("by_key", (q) => q.eq("key", cap)).unique();
  if ((used?.count ?? 0) >= DEVICE_GIVE_BACKS) return false;
  await bumpExportCount(ctx, cap, 1);
  await bumpExportCount(ctx, exp.countKey, -1);
  await ctx.db.patch(exp._id, { countKey: undefined, givenBack: true });
  return true;
}
