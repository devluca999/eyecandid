import { PLANS, periodKey } from "@eyelore/core";
import type { PlanId } from "@eyelore/core";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";

export async function userByClerkId(ctx: QueryCtx | MutationCtx, clerkId: string) {
  return await ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", clerkId)).unique();
}

export async function entitlementFor(ctx: QueryCtx | MutationCtx, userId: Id<"users">) {
  return await ctx.db.query("entitlements").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
}

/** Create the free entitlement row for a user if it does not exist yet. */
export async function ensureEntitlement(ctx: MutationCtx, userId: Id<"users">, now = Date.now()): Promise<Doc<"entitlements">> {
  const existing = await entitlementFor(ctx, userId);
  if (existing) return existing;
  const id = await ctx.db.insert("entitlements", {
    userId,
    plan: "free",
    minutesUsed: 0,
    minutesLimit: PLANS.free.monthlyMinutes,
    credits: 0,
    watermark: PLANS.free.watermark,
    period: periodKey(now),
  });
  return (await ctx.db.get(id))!;
}

/** Upsert the users row from a verified identity (JWT) or a verified webhook payload. */
export async function upsertUser(ctx: MutationCtx, a: { clerkId: string; email?: string }, now = Date.now()): Promise<Id<"users">> {
  const existing = await userByClerkId(ctx, a.clerkId);
  let id: Id<"users">;
  if (existing) {
    id = existing._id;
    const patch: Partial<Doc<"users">> = {};
    if (a.email !== undefined && a.email !== existing.email) patch.email = a.email;
    if (existing.deletedAt) patch.deletedAt = undefined;
    if (Object.keys(patch).length) await ctx.db.patch(id, patch);
  } else {
    id = await ctx.db.insert("users", { clerkId: a.clerkId, email: a.email, plan: "free", createdAt: now });
  }
  await ensureEntitlement(ctx, id, now);
  return id;
}

/** Set a user's plan everywhere it is denormalised. Limits come from the plan table, never from a client. */
export async function setPlan(ctx: MutationCtx, userId: Id<"users">, plan: PlanId, extra: Partial<Doc<"entitlements">> = {}) {
  const ent = await ensureEntitlement(ctx, userId);
  await ctx.db.patch(ent._id, { plan, minutesLimit: PLANS[plan].monthlyMinutes, watermark: PLANS[plan].watermark, ...extra });
  await ctx.db.patch(userId, { plan });
}
