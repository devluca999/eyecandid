import { v } from "convex/values";
import { internalMutation, query } from "./_generated/server";
import { evaluateFlag, FLAGS } from "@eyelore/core";

/** All flags evaluated for one subject (user id or anon id). Reactive: flips live. */
export const forSubject = query({
  args: { subject: v.string() },
  handler: async (ctx, { subject }) => {
    const out: Record<string, boolean> = {};
    for (const key of Object.keys(FLAGS)) {
      // `pro` is an allow list of approved emails: never answer "is this email approved?" to any caller
      if (key === "pro") continue;
      const row = await ctx.db.query("flags").withIndex("by_key", (q) => q.eq("key", key)).unique();
      // hello_job defaults on so a fresh deployment can prove the round-trip; everything else defaults off
      out[key] = row ? evaluateFlag(row, subject) : key === "hello_job";
    }
    return out;
  },
});

export const set = internalMutation({
  args: { key: v.string(), enabled: v.boolean(), rolloutPct: v.optional(v.number()), allow: v.optional(v.array(v.string())) },
  handler: async (ctx, a) => {
    const row = await ctx.db.query("flags").withIndex("by_key", (q) => q.eq("key", a.key)).unique();
    const next = { key: a.key, enabled: a.enabled, rolloutPct: a.rolloutPct ?? 100, allow: a.allow ?? [] };
    if (row) await ctx.db.patch(row._id, next);
    else await ctx.db.insert("flags", next);
  },
});
