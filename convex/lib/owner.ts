import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";

/** Who is calling: a Clerk user (if signed in) and/or an anonymous session id (ADR 0006). */
export async function caller(ctx: QueryCtx | MutationCtx, anonId?: string) {
  const identity = await ctx.auth.getUserIdentity();
  let userId: Id<"users"> | undefined;
  if (identity) {
    const u = await ctx.db
      .query("users")
      .withIndex("by_clerkId", (q) => q.eq("clerkId", identity.subject))
      .unique();
    userId = u?._id;
  }
  if (anonId !== undefined && !/^anon_[0-9a-f]{32}$/.test(anonId)) throw new Error("bad anon id");
  return { userId, anonId };
}

export function owns(row: { ownerUserId?: Id<"users">; ownerAnonId?: string }, who: { userId?: Id<"users">; anonId?: string }) {
  return (!!who.userId && row.ownerUserId === who.userId) || (!!who.anonId && row.ownerAnonId === who.anonId);
}
