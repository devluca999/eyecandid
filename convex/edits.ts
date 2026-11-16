import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Change, invertOps } from "@eyelore/core";
import type { EditOp } from "@eyelore/core";
import { commitChanges } from "./lib/docs";
import { ownedProject } from "./projects";

/** A user edit: ops + one-line reason. Pins the touched paths so autopilots never re-decide them. */
export const apply = mutation({
  args: { anonId: v.string(), projectId: v.id("projects"), baseVersion: v.number(), ops: v.any(), reason: v.string() },
  handler: async (ctx, a) => {
    await ownedProject(ctx, a.projectId, a.anonId);
    const change = Change.parse({ actor: "user", reason: a.reason, ops: a.ops });
    return await commitChanges(ctx, a.projectId, [change], a.baseVersion);
  },
});

/** Undo the most recent change (user or autopilot) by applying its inverse, logged as its own change. */
export const undo = mutation({
  args: { anonId: v.string(), projectId: v.id("projects"), baseVersion: v.number() },
  handler: async (ctx, a) => {
    await ownedProject(ctx, a.projectId, a.anonId);
    const last = await ctx.db.query("editOps").withIndex("by_project_version", (q) => q.eq("projectId", a.projectId)).order("desc").first();
    if (!last || last.reason.startsWith("undo · ")) return { ok: false as const, nothing: true };
    const change = { actor: "user", reason: `undo · ${last.reason}`.slice(0, 120), ops: invertOps(last.ops as EditOp[]) };
    return await commitChanges(ctx, a.projectId, [change], a.baseVersion);
  },
});

/** Change log with reasons, newest first: drives explain-on-hover and the edit history. */
export const history = query({
  args: { anonId: v.string(), projectId: v.id("projects"), limit: v.optional(v.number()) },
  handler: async (ctx, a) => {
    await ownedProject(ctx, a.projectId, a.anonId);
    const rows = await ctx.db.query("editOps").withIndex("by_project_version", (q) => q.eq("projectId", a.projectId)).order("desc").take(Math.min(a.limit ?? 200, 500));
    return rows.map((r) => ({ version: r.version, reason: r.reason, actor: r.actor, at: r.at, paths: (r.ops as EditOp[]).map((o) => o.path) }));
  },
});
