import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { AnalyticsEvent } from "@eyelore/core";
import { caller } from "./lib/owner";
import { sha256Hex } from "./lib/workerAuth";

/** Funnel event sink (typed in packages/core/src/analytics.ts). The anon id is stored only as a hash. */
export const track = mutation({
  args: { anonId: v.optional(v.string()), event: v.any() },
  handler: async (ctx, { anonId, event }) => {
    const e = AnalyticsEvent.parse(event);
    const who = await caller(ctx, anonId);
    const anonHash = anonId ? (await sha256Hex(anonId)).slice(0, 32) : undefined;
    await ctx.db.insert("events", { name: e.name, anonHash, userId: who.userId, props: e.props, ts: Date.now() });
  },
});
