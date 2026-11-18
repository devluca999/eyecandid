import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { applyChange, beadChanges, cutdownChange, decideExport, decideExportCount, JOB_SPECS, reframeChange, retakeChanges, toTimeline } from "@eyelore/core";
import type { Aspect, EditDoc, JobOutput, PlanId } from "@eyelore/core";
import { commitChanges, headDoc } from "./lib/docs";
import { enqueueJob } from "./jobs";
import { ownedProject } from "./projects";
import { caller } from "./lib/owner";
import { flagOn } from "./lib/flags";
import { freeState, MSG, refuse } from "./lib/limits";
import { addUsage, anonHashOf, usageFor } from "./lib/entitle";
import { onStillDone, stillUrls } from "./broll";
import { bumpExportCount, exportCountFor, giveBackExport, signInAvailable } from "./lib/exportCount";

/**
 * The core-loop pipeline, advanced each time a project job finishes:
 *   transcribe → autocut → beads, strikes, moments (project "ready") → reframe (background).
 * Every step lands in the edit model as explained changes; nothing is applied silently.
 */
export const onJobDone = internalMutation({
  args: { jobId: v.id("jobs") },
  handler: async (ctx, { jobId }) => {
    const job = await ctx.db.get(jobId);
    if (!job?.projectId) return;
    const projectId = job.projectId;
    const clipId = (job.meta as { clipId?: string } | undefined)?.clipId;

    // generated b-roll (convex/broll.ts): an enhancement on its own track. A failure never fails the edit (its credit
    // was already refunded in jobs.ts); a success lands as an explained, pin-respecting change.
    if (job.type === "still") return await onStillDone(ctx, job);

    if (job.status === "failed") {
      if (job.type === "reframe") return; // reframe is an enhancement: the edit stays usable, centred
      if (job.type === "render") {
        await giveBackExport(ctx, jobId); // a free export that never delivered isn't used up
        return; // export failures show on the export, not the project
      }
      await ctx.db.patch(projectId, { stage: "failed", stageDetail: `${job.type} failed · ${job.error ?? "unknown"}`.slice(0, 160) });
      return;
    }
    if (job.status === "succeeded" && job.type === "render") {
      // count the minutes once, then tell the owner if they are away (ADR 0009)
      await ctx.scheduler.runAfter(0, internal.entitlements.recordExportDone, { jobId });
      await ctx.scheduler.runAfter(0, internal.notify.onExportDone, { jobId });
      return;
    }
    if (job.status !== "succeeded" || !clipId) return;
    const owner = { ownerUserId: job.ownerUserId, ownerAnonId: job.ownerAnonId };

    if (job.type === "transcribe") {
      const t = job.output as JobOutput<"transcribe">;
      await enqueueJob(ctx, {
        type: "autocut",
        input: { words: t.words },
        idempotencyKey: `autocut:${jobId}`,
        projectId,
        meta: { clipId, transcribeJobId: jobId },
        ...owner,
      });
      await ctx.db.patch(projectId, { stage: "cutting", stageDetail: `heard ${t.words.length} words` });
      return;
    }

    if (job.type === "autocut") {
      const head = await headDoc(ctx, projectId);
      const tJobId = (job.meta as { transcribeJobId: Id<"jobs"> }).transcribeJobId;
      const tJob = await ctx.db.get(tJobId);
      if (!head || !tJob?.output) return;
      const changes = beadChanges(head.doc, clipId, tJob.output as JobOutput<"transcribe">, job.output as JobOutput<"autocut">);
      await commitChanges(ctx, projectId, changes);
      // teleprompter captures: keep the last take of each script line
      const after = await headDoc(ctx, projectId);
      if (after) {
        const retakes = retakeChanges(after.doc);
        if (retakes.length) await commitChanges(ctx, projectId, retakes);
      }
      await ctx.db.patch(projectId, { stage: "ready", stageDetail: undefined, readyAt: Date.now() });
      await ctx.scheduler.runAfter(0, internal.notify.onEditReady, { projectId, jobId });
      const clip = head.doc.clips.find((c) => c.id === clipId);
      if (clip) {
        await enqueueJob(ctx, { type: "reframe", input: { mediaId: clip.mediaId }, idempotencyKey: `reframe:${clip.mediaId}`, projectId, meta: { clipId }, ...owner });
      }
      return;
    }

    if (job.type === "reframe") {
      const r = job.output as JobOutput<"reframe">;
      await commitChanges(ctx, projectId, [reframeChange(clipId, r.keyframes, r.faces)]);
    }
  },
});

/**
 * Export (render) the current edit. Entitlements are decided here, on the server, from the caller's identity
 * (ADR 0009): nothing in the arguments can lift the watermark or the cap. `mode: "free"` is the person choosing
 * the free watermarked export (e.g. after dismissing the paywall); "best" is what their plan allows and throws
 * `paid_required` (with a reason) when that needs a paid plan.
 */
const exportArgs = {
  anonId: v.string(),
  projectId: v.id("projects"),
  aspect: v.union(v.literal("9:16"), v.literal("4:5"), v.literal("1:1"), v.literal("16:9")),
  maxDurationMs: v.optional(v.union(v.literal(15_000), v.literal(30_000), v.literal(60_000))),
  requestId: v.string(),
  mode: v.optional(v.union(v.literal("best"), v.literal("free"))),
  /**
   * Can this client actually show a sign-in? The web sends true only with Clerk configured and the `accounts` flag on;
   * mobile (no sign-in yet) and older clients send nothing. It never lifts the anonymous limit; it only picks the
   * refusal: `sign_in_required` (the web opens the sign-up) or a plain one-line "sign in on the web".
   */
  canSignIn: v.optional(v.boolean()),
};
type ExportArgs = {
  anonId: string;
  projectId: Id<"projects">;
  aspect: "9:16" | "4:5" | "1:1" | "16:9";
  maxDurationMs?: 15_000 | 30_000 | 60_000;
  requestId: string;
  mode?: "best" | "free";
  canSignIn?: boolean;
};

/** The refusal for a client that can't show a sign-in (mobile, an older web page): one plain line, no dead-end prompt. */
export const SIGN_IN_ON_THE_WEB = "this free export is used · sign in on the web for 3 a month";

/**
 * May this export go, by the free export count? Returns the counter to bump, or throws the one-line refusal. The
 * anonymous limit holds whatever the client says; `canSignIn` only picks the refusal: `sign_in_required` (the web
 * opens the sign-up) or a plain line. The one exception: sign-in isn't switched on at all on this deployment (no
 * Clerk issuer, or the `accounts` flag off), and then the export goes ahead as before.
 */
async function checkExportCount(ctx: MutationCtx, who: { userId?: Id<"users">; anonId?: string }, usage: { signedIn: boolean; plan: PlanId }, a: ExportArgs) {
  const count = await exportCountFor(ctx, who, usage.plan);
  const verdict = decideExportCount({ signedIn: usage.signedIn, plan: usage.plan, used: count.used, period: count.period, signInAvailable: await signInAvailable(ctx, a.anonId) });
  if (!verdict.ok) {
    if (verdict.code === "sign_in_required" && !a.canSignIn) throw new ConvexError({ code: "exports_used", message: SIGN_IN_ON_THE_WEB });
    throw new ConvexError({ code: verdict.code, message: verdict.message });
  }
  return verdict.count ? count.key : undefined;
}

/**
 * What an export is allowed to be (entitlements, ADR 0009): the plan, watermark, length cap, and the doc snapshot to
 * render (with a cutdown applied as a variant). Shared by the worker render and the on-device render, so both are held
 * to the same rules on the server.
 */
async function planExport(ctx: MutationCtx, a: ExportArgs, replay: boolean) {
  const project = await ownedProject(ctx, a.projectId, a.anonId);
  const who = await caller(ctx, a.anonId);
  const head = await headDoc(ctx, a.projectId);
  if (!head) throw new Error("nothing to export");
  let doc: EditDoc = { ...head.doc, aspect: a.aspect as Aspect };
  const usage = await usageFor(ctx, who);
  // the manual budget pause also stops free renders, on the worker and on device (the daily cap only gates new edits)
  if (usage.plan === "free" && (await freeState(ctx)).reason === "flag") refuse(MSG.paused);
  // the free export count (mvp-spec "Access model"), on both engines: 1 without an account (then sign-in, when it is
  // switched on), 3 a month with a free one, unlimited on a paid plan. A replayed request was counted already.
  const countKey = replay ? undefined : await checkExportCount(ctx, who, usage, a);
  const input = { requestedMs: a.maxDurationMs, fullMs: toTimeline(head.doc).durationMs };
  // Paywall rules bite only when payments can actually be taken: the `billing` flag is on for this caller AND
  // Stripe is configured. Otherwise behave as before: watermark, silent clamp to the free cap, no minutes block,
  // no `paid_required`. Usage is still recorded either way. A paid plan keeps its benefits in both modes.
  const enforce = !!process.env.STRIPE_SECRET_KEY && (await flagOn(ctx, "billing", who.userId ?? a.anonId));
  let decision = decideExport({ ...input, plan: usage.plan, mode: a.mode ?? "best", minutesUsed: usage.minutesUsed, minutesLimit: usage.minutesLimit });
  if (!decision.ok && !enforce) decision = decideExport({ ...input, plan: "free", mode: "free", minutesUsed: 0 });
  if (!decision.ok) throw new ConvexError({ code: "paid_required", reason: decision.reason, freeAvailable: decision.freeAvailable });
  const plan = { watermark: decision.watermark, capMs: decision.capMs };
  const maxMs = Math.min(a.maxDurationMs ?? plan.capMs, plan.capMs);
  const cut = cutdownChange(doc, maxMs);
  if (cut) doc = applyChange(doc, cut)!.doc; // a variant: the main edit is untouched
  JOB_SPECS.render.input.parse({ doc, aspect: a.aspect, watermark: plan.watermark, maxDurationMs: maxMs });
  const chargedAnonHash = who.userId || !a.anonId ? undefined : await anonHashOf(a.anonId);
  // counted last, once everything else has said yes, in the same transaction as the export row
  if (countKey) await bumpExportCount(ctx, countKey, 1);
  return { project, who, head, doc, plan, maxMs, decision, chargedAnonHash, countKey };
}

/** The export a replayed request already made (same project, same client request id). */
const priorExport = (ctx: MutationCtx, a: ExportArgs) =>
  ctx.db
    .query("exports")
    .withIndex("by_project", (q) => q.eq("projectId", a.projectId))
    .filter((q) => q.eq(q.field("requestId"), a.requestId))
    .first();

export const startExport = mutation({
  args: exportArgs,
  handler: async (ctx, a) => {
    await ownedProject(ctx, a.projectId, a.anonId);
    const prior = await priorExport(ctx, a);
    if (prior?.jobId) return prior.jobId;
    const { project, who, head, doc, plan, maxMs, decision, chargedAnonHash, countKey } = await planExport(ctx, a, false);
    const jobId = await enqueueJob(ctx, {
      type: "render",
      input: { doc, aspect: a.aspect, watermark: plan.watermark, maxDurationMs: maxMs },
      idempotencyKey: `render:${a.projectId}:${head.doc.version}:${a.aspect}:${maxMs}:${a.requestId}`,
      projectId: a.projectId,
      ownerUserId: project.ownerUserId,
      ownerAnonId: project.ownerAnonId,
    });
    await ctx.db.insert("exports", { projectId: a.projectId, jobId, aspect: a.aspect, maxDurationMs: a.maxDurationMs, watermark: plan.watermark, docVersion: head.doc.version, createdAt: Date.now(), plan: decision.plan, chargedUserId: who.userId, chargedAnonHash, requestId: a.requestId, countKey });
    return jobId;
  },
});

/**
 * The browser's render of an authorized on-device export failed: the free export it was counted as comes back, once.
 * Client-reported, like the render itself (ADR 0012): a free export costs us nothing, so this trust is acceptable.
 */
/** How long after authorization an on-device render may report failing and get its free export back. */
export const DEVICE_RENDER_WINDOW_MS = 10 * 60_000;

export const deviceExportFailed = mutation({
  args: { anonId: v.string(), exportId: v.id("exports") },
  handler: async (ctx, a) => {
    const exp = await ctx.db.get(a.exportId);
    if (!exp?.device) return false;
    await ownedProject(ctx, exp.projectId, a.anonId);
    // only for a render that could still be in progress: a minute-old authorization, not one reported days later
    if (!exp.countKey || Date.now() - exp.createdAt > DEVICE_RENDER_WINDOW_MS) return false;
    await bumpExportCount(ctx, exp.countKey, -1);
    await ctx.db.patch(exp._id, { countKey: undefined, givenBack: true });
    return true;
  },
});

/**
 * On-device export (ADR 0012): the same server-side plan (watermark, cap, paywall) as a worker render, recorded and
 * counted now; the visitor's browser renders the returned snapshot. A determined user could alter their own browser's
 * render; the free tier accepts that (it costs us nothing) — paid features stay server-side.
 */
export const authorizeDeviceExport = mutation({
  args: exportArgs,
  handler: async (ctx, a) => {
    const owned = await ownedProject(ctx, a.projectId, a.anonId);
    if (owned.engine !== "device") throw new Error("this edit renders on the server");
    // a replayed request (a retry after a dropped response) gets the same plan again, not a second count
    // exactly the plan it was given, never a fresh one built from the edit as it is now (that would be a new export)
    const prior = await priorExport(ctx, a);
    if (prior) {
      if (!prior.device || !prior.planDoc || prior.planMaxMs === undefined || prior.aspect !== a.aspect) throw new ConvexError("that export was already made · export again");
      const snap = prior.planDoc as EditDoc;
      // its count was given back (the render "failed"): handing the plan out again is a new export, counted again
      if (prior.givenBack) {
        const who = await caller(ctx, a.anonId);
        const key = await checkExportCount(ctx, who, await usageFor(ctx, who), a);
        if (key) await bumpExportCount(ctx, key, 1);
        await ctx.db.patch(prior._id, { countKey: key, givenBack: false });
      }
      return { exportId: prior._id, doc: snap, watermark: prior.watermark, maxMs: prior.planMaxMs, stills: await stillUrls(ctx, a.projectId, snap) };
    }
    const { who, head, doc, plan, maxMs, decision, chargedAnonHash, countKey } = await planExport(ctx, a, false);
    const exportId = await ctx.db.insert("exports", {
      projectId: a.projectId,
      device: true,
      aspect: a.aspect,
      maxDurationMs: a.maxDurationMs,
      watermark: plan.watermark,
      docVersion: head.doc.version,
      createdAt: Date.now(),
      plan: decision.plan,
      chargedUserId: who.userId,
      chargedAnonHash,
      usageCounted: true,
      requestId: a.requestId,
      countKey,
      planDoc: doc,
      planMaxMs: maxMs,
    });
    await addUsage(ctx, { userId: who.userId, anonHash: chargedAnonHash }, toTimeline(doc).durationMs / 60_000);
    // generated b-roll stills in the doc, as signed URLs for the browser renderer (none on the free path)
    return { exportId, doc, watermark: plan.watermark, maxMs, stills: await stillUrls(ctx, a.projectId, doc) };
  },
});
