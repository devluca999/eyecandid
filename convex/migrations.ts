import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation } from "./_generated/server";
import { ledgerFor, saveLedger } from "./lib/credits";

const BATCH = 100;

/**
 * ADR 0014 rollout 1: fold every `entitlements.credits` balance into a `legacy:<entitlement>` lot with no expiry, and
 * zero the field in the same transaction. Idempotent and bounded: re-running finds nothing left to fold. Not required
 * for correctness (any mutation that touches a balance folds it first, and reads count it), but it empties the old
 * field so it can be dropped later.
 *
 *   npx convex run migrations:creditsToLots            # dev
 *   npx convex run --prod migrations:creditsToLots     # prod, after the deploy (owner)
 */
export const creditsToLots = internalMutation({
  args: { cursor: v.optional(v.string()) },
  handler: async (ctx, { cursor }) => {
    const page = await ctx.db.query("entitlements").paginate({ cursor: cursor ?? null, numItems: BATCH });
    const now = Date.now();
    let folded = 0;
    for (const ent of page.page) {
      if (ent.credits <= 0) continue;
      const l = await ledgerFor(ctx, ent.userId, now);
      // only the legacy balance is written here: a pending monthly allowance is left to the next charge or grant
      const legacyOnly = { ...l, monthly: undefined };
      await saveLedger(ctx, legacyOnly, l.lots.filter((x) => !l.monthly || x.id !== `m:${l.monthly}`), now);
      folded++;
    }
    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.migrations.creditsToLots, { cursor: page.continueCursor });
    return { folded, done: page.isDone };
  },
});
