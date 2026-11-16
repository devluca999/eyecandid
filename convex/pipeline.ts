import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { applyChange, beadChanges, cutdownChange, JOB_SPECS, reframeChange, retakeChanges } from "@eyelore/core";
import type { Aspect, EditDoc, JobOutput } from "@eyelore/core";
import { commitChanges, headDoc } from "./lib/docs";
import { enqueueJob } from "./jobs";
import { ownedProject } from "./projects";

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

const FREE_MAX_EXPORT_MS = 60_000;

/**
 * Export (render) the current edit. Entitlements are checked here, on the server: anonymous and free exports carry
 * a watermark and are capped at 60s. The signup/paywall step lives in the client flow before this call (Phase 2b).
 */
export const startExport = mutation({
  args: {
    anonId: v.string(),
    projectId: v.id("projects"),
    aspect: v.union(v.literal("9:16"), v.literal("4:5"), v.literal("1:1"), v.literal("16:9")),
    maxDurationMs: v.optional(v.union(v.literal(15_000), v.literal(30_000), v.literal(60_000))),
    requestId: v.string(),
  },
  handler: async (ctx, a) => {
    const project = await ownedProject(ctx, a.projectId, a.anonId);
    const head = await headDoc(ctx, a.projectId);
    if (!head) throw new Error("nothing to export");
    let doc: EditDoc = { ...head.doc, aspect: a.aspect as Aspect };
    const plan = { watermark: true, capMs: FREE_MAX_EXPORT_MS }; // entitlements: paid plans arrive with Stripe
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
    await ctx.db.insert("exports", { projectId: a.projectId, jobId, aspect: a.aspect, maxDurationMs: a.maxDurationMs, watermark: plan.watermark, docVersion: head.doc.version, createdAt: Date.now() });
    return jobId;
  },
});
