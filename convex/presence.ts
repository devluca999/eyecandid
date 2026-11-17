import { v } from "convex/values";
import { mutation } from "./_generated/server";
import { caller, owns } from "./lib/owner";

/**
 * The "away" signal for "your edit is ready" (ADR 0009): the editor beats every ~20s while its tab is visible.
 * Someone is "watching" a project if a beat arrived in the last WATCHING_MS. No beat, tab hidden or closed
 * means away, and the ready email may be sent.
 */
export const WATCHING_MS = 45_000;

export const beat = mutation({
  args: { anonId: v.optional(v.string()), projectId: v.id("projects") },
  handler: async (ctx, { anonId, projectId }) => {
    // a beat for a deleted (or someone else's) edit is a quiet no-op, not an error: tabs outlive deletes
    const project = await ctx.db.get(projectId);
    if (!project || !owns(project, await caller(ctx, anonId))) return;
    const now = Date.now();
    const row = await ctx.db.query("presence").withIndex("by_project", (q) => q.eq("projectId", projectId)).unique();
    if (!row) await ctx.db.insert("presence", { projectId, lastSeenAt: now });
    else if (now - row.lastSeenAt > 5_000) await ctx.db.patch(row._id, { lastSeenAt: now });
  },
});
