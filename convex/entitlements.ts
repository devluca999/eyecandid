import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { PLANS } from "@eyelore/core";
import { caller } from "./lib/owner";
import { addUsage, usageFor } from "./lib/entitle";
import { exportCountFor, signInAvailable } from "./lib/exportCount";

/**
 * The caller's plan and usage, for the UI. Always derived on the server. `exports` is the free export count the gate
 * shows: used of limit (null = unlimited) this session or this month, and whether sign-in is switched on at all.
 */
export const mine = query({
  args: { anonId: v.optional(v.string()) },
  handler: async (ctx, { anonId }) => {
    const who = await caller(ctx, anonId);
    const u = await usageFor(ctx, who);
    const def = PLANS[u.plan];
    const c = await exportCountFor(ctx, who, u.plan);
    return {
      signedIn: u.signedIn,
      plan: u.plan,
      label: def.label,
      watermark: def.watermark,
      exportCapMs: def.exportCapMs,
      minutesUsed: Math.round(u.minutesUsed * 100) / 100,
      minutesLimit: u.minutesLimit ?? def.monthlyMinutes,
      exports: { used: c.used, limit: c.limit, scope: c.scope, signInAvailable: await signInAvailable(ctx, anonId) },
    };
  },
});

/** Called when a render job succeeds: count its minutes once, against whoever the export was charged to. */
export const recordExportDone = internalMutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const exp = await ctx.db.query("exports").withIndex("by_job", (q) => q.eq("jobId", jobId)).unique();
    if (!exp || exp.usageCounted) return;
    const job = await ctx.db.get(jobId);
    if (job?.status !== "succeeded") return; // gone, or a canceled shell: nothing to count
    const ms = (job.output as { durationMs?: number } | undefined)?.durationMs ?? 0;
    await addUsage(ctx, { userId: exp.chargedUserId, anonHash: exp.chargedAnonHash }, ms / 60_000);
    await ctx.db.patch(exp._id, { usageCounted: true });
  },
});
