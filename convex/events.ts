import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { AnalyticsEvent } from "@eyelore/core";
import { caller } from "./lib/owner";

/** Funnel event sink (typed in packages/core/src/analytics.ts). */
export const track = mutation({
  args: { anonId: v.optional(v.string()), event: v.any() },
  handler: async (ctx, { anonId, event }) => {
    const e = AnalyticsEvent.parse(event);
    const who = await caller(ctx, anonId);
    await ctx.db.insert("events", { name: e.name, anonId, userId: who.userId, props: e.props, ts: Date.now() });
  },
});
