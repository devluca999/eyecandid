import { giveBackDeviceCount } from "./lib/exportCount";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { EditDoc, invertOps, QC_ACTOR, qcAutoFix, qcDoc, qcExport, qcVerdict, RenderMeasure, statsFromMeasure, type Aspect, type EditOp, type QcIssue, type QcResult } from "@eyelore/core";
import { commitChanges, headDoc } from "./lib/docs";
import { ownedProject } from "./projects";

/**
 * The quality check on every export (docs/goal-plan-build.md §4, packages/core qc.ts + qcGate.ts). Never ship a broken
 * export:
 *  - before rendering, the safe fixes land in the edit as explained autopilot:qc changes (a cut inside a word moves
 *    to the word's edge, captions move into the safe band), then anything that still blocks stops the export before
 *    it is rendered or counted;
 *  - after rendering, the file's measurements (the worker's ffmpeg numbers, or the browser's own samples) decide:
 *    block → not delivered (and not counted); ask → held until "export anyway"; note → delivered, recorded here.
 */

type Status = "ok" | "ask" | "blocked";
const statusOf = (r: { verdict: { ok: boolean; blocking: unknown[] } }): Status => (r.verdict.blocking.length ? "blocked" : r.verdict.ok ? "ok" : "ask");

/** A pre-render block, as the error the export pill reads ({ code: "qc_blocked", message, atMs, issue }). */
export function qcRefusal(issue: QcIssue): ConvexError<{ code: string; message: string; atMs: number; issue: string }> {
  return new ConvexError({ code: "qc_blocked", message: issue.message, atMs: issue.atMs, issue: issue.code });
}

/**
 * Before an export: fix what's safe in the main edit (committed, explained, so it shows in the edit's history and the
 * person can put it back), check once more, and refuse when something still blocks. Returns the reasons it fixed.
 */
export async function fixBeforeExport(ctx: MutationCtx, projectId: Id<"projects">, aspect: Aspect): Promise<string[]> {
  const head = await headDoc(ctx, projectId);
  if (!head) return [];
  const r = qcAutoFix(EditDoc.parse({ ...head.doc, aspect }));
  if (r.changes.length) await commitChanges(ctx, projectId, r.changes);
  return r.changes.map((c) => c.reason);
}

/** After fixes and the cutdown: anything in the snapshot itself that blocks stops the export here. */
export function refuseBlockedDoc(doc: EditDoc) {
  const blocking = qcVerdict(qcDoc(doc)).blocking;
  if (blocking.length) throw qcRefusal(blocking[0]!);
}

function record(r: QcResult, extra: { minutes?: number } = {}): NonNullable<Doc<"exports">["qc"]> {
  return { status: statusOf(r), checked: r.checked, issues: r.issues, at: Date.now(), ...extra };
}

/**
 * A worker render finished: decide it from its own measurements. Returns whether it is delivered now (so the minutes
 * are counted and the owner told). An older worker's output has no `measure`: delivered, marked unchecked.
 */
export async function gateRender(ctx: MutationCtx, job: Doc<"jobs">): Promise<boolean> {
  const exp = await ctx.db.query("exports").withIndex("by_job", (q) => q.eq("jobId", job._id)).unique();
  const doc = EditDoc.parse((job.input as { doc: unknown }).doc);
  const m = RenderMeasure.safeParse((job.output as { measure?: unknown } | undefined)?.measure);
  const r = qcExport(doc, m.success ? statsFromMeasure(m.data, doc) : undefined);
  if (exp) await ctx.db.patch(exp._id, { qc: { ...record(r), fixed: exp.qc?.fixed } });
  for (const n of r.issues.filter((i) => i.gate === "note")) console.log(`[qc] note ${n.code} · ${n.message}`);
  return statusOf(r) === "ok";
}

/**
 * The on-device render finished (ADR 0012): the browser measured its own file and decided with the same core code.
 * What it found is recorded here; a blocked export gives back the minutes `authorizeDeviceExport` counted up front.
 * The browser could lie about its own render; that only affects the free tier's own export, as ADR 0012 accepts.
 */
export const recordDevice = mutation({
  args: { anonId: v.string(), exportId: v.id("exports"), checked: v.boolean(), issues: v.array(v.any()) },
  handler: async (ctx, a) => {
    const exp = await ctx.db.get(a.exportId);
    if (!exp?.device) throw new Error("not found");
    await ownedProject(ctx, exp.projectId, a.anonId);
    if (exp.qc && exp.qc.status !== "pending") return exp.qc.status; // decided once
    const issues = a.issues.slice(0, 50) as QcIssue[];
    const status = statusOf({ verdict: qcVerdict(issues) });
    if (status === "blocked" && exp.qc?.minutes) await giveBackMinutes(ctx, exp, exp.qc.minutes);
    // a blocked export was never delivered: its free export comes back too (capped, like a failed render)
    if (status === "blocked" && exp.qc?.status !== "blocked") await giveBackDeviceCount(ctx, exp);
    await ctx.db.patch(exp._id, { qc: { ...exp.qc, status, checked: a.checked, issues, at: Date.now() } });
    for (const n of issues.filter((i) => i.gate === "note")) console.log(`[qc] device note ${n.code} · ${n.message}`);
    return status;
  },
});

/**
 * "Export anyway": the person accepts what is theirs to accept (their footage clips, a cut they placed). Never lifts a
 * block. A held worker render is delivered now: its minutes are counted and the owner told, as for any other.
 */
export const acceptExport = mutation({
  args: { anonId: v.string(), exportId: v.id("exports") },
  handler: async (ctx, a) => {
    const exp = await ctx.db.get(a.exportId);
    if (!exp) throw new Error("not found");
    await ownedProject(ctx, exp.projectId, a.anonId);
    if (exp.qc?.status !== "ask") return exp.qc?.status ?? "ok";
    await ctx.db.patch(exp._id, { qc: { ...exp.qc, accepted: true } });
    if (exp.jobId) {
      await ctx.scheduler.runAfter(0, internal.entitlements.recordExportDone, { jobId: exp.jobId });
      await ctx.scheduler.runAfter(0, internal.notify.onExportDone, { jobId: exp.jobId });
    }
    return "ok";
  },
});

/** Take back minutes counted for an export that was never delivered (from the latest period; never below zero). */
async function giveBackMinutes(ctx: MutationCtx, exp: Doc<"exports">, minutes: number) {
  if (exp.chargedUserId) {
    const ent = await ctx.db.query("entitlements").withIndex("by_user", (q) => q.eq("userId", exp.chargedUserId!)).unique();
    if (ent) await ctx.db.patch(ent._id, { minutesUsed: Math.max(0, ent.minutesUsed - minutes) });
  } else if (exp.chargedAnonHash) {
    const rows = await ctx.db.query("anonUsage").withIndex("by_anon_period", (q) => q.eq("anonHash", exp.chargedAnonHash!)).collect();
    const row = rows.sort((x, y) => (x.period < y.period ? 1 : -1))[0];
    if (row) await ctx.db.patch(row._id, { minutesUsed: Math.max(0, row.minutesUsed - minutes) });
  }
}

/**
 * Put back the quality check's last fix (a cut moved to a word boundary goes back where it was). The inverse is the
 * person's own change, so it is pinned: the next export leaves it alone and asks about it instead of moving it again.
 */
export const undoFix = mutation({
  args: { anonId: v.string(), projectId: v.id("projects") },
  handler: async (ctx, a) => {
    await ownedProject(ctx, a.projectId, a.anonId);
    const recent = await ctx.db.query("editOps").withIndex("by_project_version", (q) => q.eq("projectId", a.projectId)).order("desc").take(50);
    const last = recent.find((r) => r.actor === QC_ACTOR && !r.undone);
    if (!last) return { ok: false as const, nothing: true };
    const r = await commitChanges(ctx, a.projectId, [{ actor: "user", reason: `undo · ${last.reason}`.slice(0, 120), ops: invertOps(last.ops as EditOp[]) }]);
    if (r.ok) await ctx.db.patch(last._id, { undone: true });
    return r;
  },
});
