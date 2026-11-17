import { isPlanId, periodKey } from "@eyelore/core";
import type { PlanId } from "@eyelore/core";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { sha256Hex } from "./workerAuth";
import { ensureEntitlement, entitlementFor } from "./users";

export interface Usage {
  plan: PlanId;
  minutesUsed: number;
  /** stored limit for signed-in users (a support override); undefined = the plan default */
  minutesLimit?: number;
  signedIn: boolean;
}

export const anonHashOf = async (anonId: string) => (await sha256Hex(anonId)).slice(0, 32);

/**
 * The caller's plan and this period's usage, resolved on the server. Only the authenticated identity can have a
 * paid plan: an anon id never does, whatever is passed.
 */
export async function usageFor(ctx: QueryCtx | MutationCtx, who: { userId?: Id<"users">; anonId?: string }, now = Date.now()): Promise<Usage> {
  const period = periodKey(now);
  if (who.userId) {
    const ent = await entitlementFor(ctx, who.userId);
    if (!ent) return { plan: "free", minutesUsed: 0, signedIn: true };
    return {
      plan: isPlanId(ent.plan) ? ent.plan : "free",
      minutesUsed: ent.period === period ? ent.minutesUsed : 0,
      minutesLimit: ent.minutesLimit,
      signedIn: true,
    };
  }
  if (who.anonId) {
    const hash = await anonHashOf(who.anonId);
    const row = await ctx.db.query("anonUsage").withIndex("by_anon_period", (q) => q.eq("anonHash", hash).eq("period", period)).unique();
    return { plan: "free", minutesUsed: row?.minutesUsed ?? 0, signedIn: false };
  }
  return { plan: "free", minutesUsed: 0, signedIn: false };
}

/** Add rendered minutes to whoever was charged. Resets a user's counter on a new month. */
export async function addUsage(ctx: MutationCtx, to: { userId?: Id<"users">; anonHash?: string }, minutes: number, now = Date.now()) {
  const period = periodKey(now);
  if (to.userId) {
    const ent = await ensureEntitlement(ctx, to.userId, now);
    const base = ent.period === period ? ent.minutesUsed : 0;
    await ctx.db.patch(ent._id, { minutesUsed: base + minutes, period });
  } else if (to.anonHash) {
    const row = await ctx.db.query("anonUsage").withIndex("by_anon_period", (q) => q.eq("anonHash", to.anonHash!).eq("period", period)).unique();
    if (row) await ctx.db.patch(row._id, { minutesUsed: row.minutesUsed + minutes });
    else await ctx.db.insert("anonUsage", { anonHash: to.anonHash, period, minutesUsed: minutes });
  }
}
