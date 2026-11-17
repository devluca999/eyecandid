import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { entitlementFor, upsertUser, userByClerkId } from "./lib/users";

/** Upsert the caller's users row from their Clerk JWT. Idempotent. Requires a signed-in caller. */
export const ensure = mutation({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("not signed in");
    return await upsertUser(ctx, { clerkId: identity.subject, email: identity.email ?? undefined });
  },
});

/** Clerk user.created / user.updated webhook (verified in http.ts). */
export const upsertFromWebhook = internalMutation({
  args: { clerkId: v.string(), email: v.optional(v.string()) },
  handler: async (ctx, a) => {
    await upsertUser(ctx, a);
  },
});

/**
 * Clerk user.deleted webhook: the person asked to go. Clear the email and drop the entitlement; projects stay
 * (hard deletion of media is an owner decision, see ADR 0009 open questions).
 */
export const removeFromWebhook = internalMutation({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const u = await userByClerkId(ctx, clerkId);
    if (!u) return;
    await ctx.db.patch(u._id, { email: undefined, plan: "free", deletedAt: Date.now() });
    const ent = await entitlementFor(ctx, u._id);
    if (ent) await ctx.db.delete(ent._id);
  },
});
