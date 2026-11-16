import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { PLANS } from "@eyelore/core";
import { caller } from "./lib/owner";
import { addUsage, usageFor } from "./lib/entitle";

/** The caller's plan and usage, for the UI. Always derived on the server. */
export const mine = query({
  args: { anonId: v.optional(v.string()) },
  handler: async (ctx, { anonId }) => {
    const who = await caller(ctx, anonId);
    const u = await usageFor(ctx, who);
    const def = PLANS[u.plan];
    return {
      signedIn: u.signedIn,
      plan: u.plan,
      label: def.label,
      watermark: def.watermark,
      exportCapMs: def.exportCapMs,
      minutesUsed: Math.round(u.minutesUsed * 100) / 100,
      minutesLimit: u.minutesLimit ?? def.monthlyMinutes,
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
    if (job?.status !== "succeeded") return;
    const ms = (job.output as { durationMs?: number } | undefined)?.durationMs ?? 0;
    await addUsage(ctx, { userId: exp.chargedUserId, anonHash: exp.chargedAnonHash }, ms / 60_000);
    await ctx.db.patch(exp._id, { usageCounted: true });
  },
});
