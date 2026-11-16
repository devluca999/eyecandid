import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { internalMutation, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { applyChange, beadChanges, cutdownChange, decideExport, JOB_SPECS, reframeChange, toTimeline } from "@eyelore/core";
import type { Aspect, EditDoc, JobOutput } from "@eyelore/core";
import { commitChanges, headDoc } from "./lib/docs";
import { enqueueJob } from "./jobs";
import { ownedProject } from "./projects";
import { caller } from "./lib/owner";
import { flagOn } from "./lib/flags";
import { anonHashOf, usageFor } from "./lib/entitle";

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

    if (job.status === "failed") {
      if (job.type === "reframe") return; // reframe is an enhancement: the edit stays usable, centred
      if (job.type === "render") return; // export failures show on the export, not the project
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
      await ctx.db.patch(projectId, { stage: "ready", stageDetail: undefined, readyAt: Date.now() });
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
export const startExport = mutation({
  args: {
    anonId: v.string(),
    projectId: v.id("projects"),
    aspect: v.union(v.literal("9:16"), v.literal("4:5"), v.literal("1:1"), v.literal("16:9")),
    maxDurationMs: v.optional(v.union(v.literal(15_000), v.literal(30_000), v.literal(60_000))),
    requestId: v.string(),
    mode: v.optional(v.union(v.literal("best"), v.literal("free"))),
  },
  handler: async (ctx, a) => {
    const project = await ownedProject(ctx, a.projectId, a.anonId);
    const who = await caller(ctx, a.anonId);
    const head = await headDoc(ctx, a.projectId);
    if (!head) throw new Error("nothing to export");
    let doc: EditDoc = { ...head.doc, aspect: a.aspect as Aspect };
    const usage = await usageFor(ctx, who);
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
    const jobId = await enqueueJob(ctx, {
      type: "render",
      input: { doc, aspect: a.aspect, watermark: plan.watermark, maxDurationMs: maxMs },
      idempotencyKey: `render:${a.projectId}:${head.doc.version}:${a.aspect}:${maxMs}:${a.requestId}`,
      projectId: a.projectId,
      ownerUserId: project.ownerUserId,
      ownerAnonId: project.ownerAnonId,
    });
    await ctx.db.insert("exports", { projectId: a.projectId, jobId, aspect: a.aspect, maxDurationMs: a.maxDurationMs, watermark: plan.watermark, docVersion: head.doc.version, createdAt: Date.now(), plan: decision.plan, chargedUserId: who.userId, chargedAnonHash: who.userId || !a.anonId ? undefined : await anonHashOf(a.anonId) });
    return jobId;
  },
});
