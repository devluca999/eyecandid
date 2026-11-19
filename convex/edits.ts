import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { Change, dialChanges, invertOps, isSpellingFix, VERSION_IDS, versionChanges, type DialValues, type VersionId } from "@eyelore/core";
import { headDoc } from "./lib/docs";
import type { EditOp } from "@eyelore/core";
import { commitChanges } from "./lib/docs";
import { ownedProject } from "./projects";
import { caller } from "./lib/owner";
import { dropLabelsAt, labelOwnerOf } from "./lib/labels";

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
    return await commitChanges(ctx, a.projectId, [change], a.baseVersion, await labelOwnerOf(await caller(ctx, a.anonId)));
  },
});

/**
 * Undo your most recent change that isn't already undone (repeat to walk further back). Autopilot changes are not
 * undone by ⌘Z: they are restored one by one in place (click a struck word). The undo itself is logged.
 */
export const undo = mutation({
  args: { anonId: v.string(), projectId: v.id("projects"), baseVersion: v.number() },
  handler: async (ctx, a) => {
    await ownedProject(ctx, a.projectId, a.anonId);
    const recent = await ctx.db.query("editOps").withIndex("by_project_version", (q) => q.eq("projectId", a.projectId)).order("desc").take(200);
    const last = recent.find((r) => r.actor === "user" && !r.undone && !r.reason.startsWith("undo · "));
    if (!last) return { ok: false as const, nothing: true };
    const change = { actor: "user", reason: `undo · ${last.reason}`.slice(0, 120), ops: invertOps(last.ops as EditOp[]) };
    const r = await commitChanges(ctx, a.projectId, [change], a.baseVersion);
    if (r.ok) {
      await ctx.db.patch(last._id, { undone: true });
      // the undone change takes its labels back (same docVersion); the undo itself writes none (no labelOwner above)
      await dropLabelsAt(ctx, a.projectId, last.version);
    }
    // undoing a dial move (or a picked version, which moves the dials) puts the dial back, so the cut follows it back too
    if (r.ok && change.ops.some((o) => o.path.startsWith("/style/dials"))) {
      const head = (await headDoc(ctx, a.projectId))!.doc;
      const follow = dialChanges(head, head.style.dials);
      if (follow.length) return await commitChanges(ctx, a.projectId, follow);
    }
    return r;
  },
});

const DIAL_WORD: Record<keyof DialValues, string> = { pace: "pace", brollDensity: "b-roll", energy: "energy" };

/**
 * Turn the dials. Writes the dial values (your change, so ⌘Z puts a dial back) and, server-side, the re-edit they
 * ask for: `dialChanges` from packages/core, each an explained autopilot:dials change that skips anything pinned.
 * Optimistic like `apply`: a stale `baseVersion` is rejected and the client resends on the new head.
 */
export const setDials = mutation({
  args: {
    anonId: v.string(),
    projectId: v.id("projects"),
    baseVersion: v.number(),
    dials: v.object({ pace: v.number(), brollDensity: v.number(), energy: v.number() }),
  },
  handler: async (ctx, a) => {
    await ownedProject(ctx, a.projectId, a.anonId);
    const head = await headDoc(ctx, a.projectId);
    if (!head) throw new Error("no edit doc");
    if (head.doc.version !== a.baseVersion) return { ok: false as const, conflict: true, version: head.doc.version };
    const clamp = (x: number) => (Number.isFinite(x) ? Math.round(Math.max(0, Math.min(1, x)) * 100) / 100 : 0.5);
    const dials: DialValues = { pace: clamp(a.dials.pace), brollDensity: clamp(a.dials.brollDensity), energy: clamp(a.dials.energy) };
    const cur = head.doc.style.dials;
    const moved = (Object.keys(DIAL_WORD) as (keyof DialValues)[]).filter((k) => cur[k] !== dials[k]);
    if (!moved.length) return { ok: true as const, version: head.doc.version, skipped: [] as string[] };
    const set: EditOp[] = moved.map((k) => ({ op: "set", path: `/style/dials/${k}`, value: dials[k] }));
    const reason = moved.map((k) => `${DIAL_WORD[k]} ${Math.round(dials[k] * 100)}%`).join(", ");
    const changes = [{ actor: "user", reason: `dial · ${reason}`, ops: set }, ...dialChanges(head.doc, dials)];
    return await commitChanges(ctx, a.projectId, changes, a.baseVersion);
  },
});

/**
 * Pick one of the three versions of the take (packages/core/src/versions.ts). One undoable change by you with a
 * one-line reason ("picked punchy · tighter pauses, push-ins, bold captions"), then the explained autopilot changes
 * that follow it; anything you pinned stays as you left it. Same optimistic rule as `apply`.
 */
export const pickVersion = mutation({
  args: { anonId: v.string(), projectId: v.id("projects"), baseVersion: v.number(), version: v.string() },
  handler: async (ctx, a) => {
    await ownedProject(ctx, a.projectId, a.anonId);
    if (!(VERSION_IDS as readonly string[]).includes(a.version)) throw new Error("unknown version");
    const head = await headDoc(ctx, a.projectId);
    if (!head) throw new Error("no edit doc");
    if (head.doc.version !== a.baseVersion) return { ok: false as const, conflict: true, version: head.doc.version };
    const changes = versionChanges(head.doc, a.version as VersionId);
    if (!changes.length) return { ok: true as const, version: head.doc.version, skipped: [] as string[], same: true as const };
    return await commitChanges(ctx, a.projectId, changes, a.baseVersion);
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
