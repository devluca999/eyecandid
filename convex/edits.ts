import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Change, invertOps, isSpellingFix } from "@eyelore/core";
import { headDoc } from "./lib/docs";
import type { EditOp } from "@eyelore/core";
import { commitChanges } from "./lib/docs";
import { ownedProject } from "./projects";

/** A user edit: ops + one-line reason. Pins the touched paths so autopilots never re-decide them. */
export const apply = mutation({
  args: { anonId: v.string(), projectId: v.id("projects"), baseVersion: v.number(), ops: v.any(), reason: v.string() },
  handler: async (ctx, a) => {
    await ownedProject(ctx, a.projectId, a.anonId);
    const change = Change.parse({ actor: "user", reason: a.reason, ops: a.ops });
    // captions keep the speaker's words: overrides may only fix spelling (enforced here, not just in the UI)
    const overrides = change.ops.filter((o) => o.path.startsWith("/captions/overrides"));
    if (overrides.length) {
      const head = await headDoc(ctx, a.projectId);
      const words = new Map(head!.doc.beads.flatMap((b) => b.words).map((w) => [w.id, w.text]));
      for (const o of overrides) {
        const v = (o as { value?: { wordId?: string; text?: string } }).value;
        if (o.op === "remove") continue;
        const original = v?.wordId ? words.get(v.wordId) : undefined;
        if (!original || !v?.text || !isSpellingFix(original, v.text)) throw new Error("captions keep your words · fix spelling only");
      }
    }
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
