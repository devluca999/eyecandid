import { v } from "convex/values";
import { mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { sha256Hex } from "./lib/workerAuth";
import { upsertUser } from "./lib/users";

const ANON_RE = /^anon_[0-9a-f]{32}$/;

/**
 * Anonymous to account claim (ADR 0006, 0009).
 * The anon id is a capability held by the device, so presenting it proves ownership of the anonymous work.
 * Moves every project (and its jobs) with that anon id and no owner user to the caller. Idempotent. A project that
 * already belongs to a user, including this one, is never moved. Each call that moves something is recorded.
 */
export const claim = mutation({
  args: { anonId: v.string() },
  handler: async (ctx, { anonId }) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) throw new Error("not signed in");
    if (!ANON_RE.test(anonId)) throw new Error("bad anon id");
    const userId = await upsertUser(ctx, { clerkId: identity.subject, email: identity.email ?? undefined });

    const rows = await ctx.db.query("projects").withIndex("by_owner_anon", (q) => q.eq("ownerAnonId", anonId)).take(1000);
    const moved: Id<"projects">[] = [];
    let skipped = 0;
    let alreadyYours = 0;
    for (const p of rows) {
      if (!p.ownerUserId) {
        await ctx.db.patch(p._id, { ownerUserId: userId });
        moved.push(p._id);
      } else if (p.ownerUserId === userId) alreadyYours++;
      else skipped++;
    }
    if (moved.length) {
      const movedSet = new Set<string>(moved);
      const jobs = await ctx.db.query("jobs").withIndex("by_owner_anon", (q) => q.eq("ownerAnonId", anonId)).take(2000);
      for (const j of jobs) if (!j.ownerUserId && j.projectId && movedSet.has(j.projectId)) await ctx.db.patch(j._id, { ownerUserId: userId });
      await ctx.db.insert("accountClaims", { userId, anonHash: (await sha256Hex(anonId)).slice(0, 32), projectIds: moved, skipped, at: Date.now() });
    }
    return { moved: moved.length, alreadyYours, skipped };
  },
});
