import { ConvexError, v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { brollMediaIds, brollStillChange, gpuCreditCost, MAX_STILL_PROMPT, STILL_SIZE, stillPrompt } from "@eyelore/core";
import type { EditDoc } from "@eyelore/core";
import { commitChanges, headDoc } from "./lib/docs";
import { caller, owns } from "./lib/owner";
import { gpuStanding } from "./lib/entitle";
import { mediaStore } from "./lib/mediaStore";
import { enqueueJob, gpuPoolExists } from "./jobs";
import { ownedProject } from "./projects";

/**
 * Generated b-roll stills for a bead (Phase 4, ADR 0013). The request goes through `enqueueJob`, so the Pro gate and
 * the credit charge (convex/lib/entitle.ts) apply exactly as for any GPU job; refusals are one-line ConvexErrors the
 * editor shows verbatim. The GPU worker (services/engine/deploy/modal_gpu_app.py) renders the still; on success
 * `onStillDone` places it over the bead as an explained autopilot change that skips anything the user pinned.
 */

const IN_FLIGHT: Doc<"jobs">["status"][] = ["queued", "leased", "running"];
const beadOf = (j: Doc<"jobs">) => (j.meta as { beadId?: string } | undefined)?.beadId;

async function stillJobs(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">) {
  return (await ctx.db.query("jobs").withIndex("by_project", (q) => q.eq("projectId", projectId)).order("desc").take(100)).filter((j) => j.type === "still");
}

export const requestStill = mutation({
  args: { anonId: v.string(), projectId: v.id("projects"), beadId: v.string(), prompt: v.optional(v.string()), requestId: v.string() },
  handler: async (ctx, a) => {
    const project = await ownedProject(ctx, a.projectId, a.anonId);
    const who = await caller(ctx, a.anonId);
    const key = `still:${a.projectId}:${a.beadId}:${a.requestId.slice(0, 64)}`;
    const replay = await ctx.db.query("jobs").withIndex("by_idempotency", (q) => q.eq("idempotencyKey", key)).first();
    if (replay) return replay._id;

    const head = await headDoc(ctx, a.projectId);
    const bead = head?.doc.beads.find((b) => b.id === a.beadId);
    if (!head || !bead) throw new ConvexError("that bead isn't in this edit any more");
    if (bead.struck) throw new ConvexError("that bead is cut · keep it first");
    const prompt = (a.prompt?.trim() || stillPrompt(head.doc, bead)).replace(/\s+/g, " ").slice(0, MAX_STILL_PROMPT);
    if (!prompt) throw new ConvexError("this bead has no words to picture · type a prompt");

    // Pro first, so a free account hears about Pro rather than about our GPU. enqueueJob checks again and charges.
    const standing = await gpuStanding(ctx, who.userId, gpuCreditCost("still"));
    if (!standing.ok) throw new ConvexError({ code: standing.code, message: standing.message, ...(standing.extra ?? {}) });
    if ((await stillJobs(ctx, a.projectId)).some((j) => IN_FLIGHT.includes(j.status) && beadOf(j) === a.beadId)) {
      throw new ConvexError("a still for this bead is already on its way");
    }
    // no GPU worker registered = the GPU app isn't deployed: the job would queue forever, so don't take the credit
    if (!(await gpuPoolExists(ctx))) throw new ConvexError("the gpu isn't set up yet · nothing was charged");

    const { w, h } = STILL_SIZE[head.doc.aspect];
    return await enqueueJob(ctx, {
      type: "still",
      input: { prompt, refMediaIds: [], w, h },
      idempotencyKey: key,
      projectId: a.projectId,
      meta: { beadId: a.beadId },
      ownerUserId: who.userId,
      ownerAnonId: project.ownerAnonId,
      maxAttempts: 2,
    });
  },
});

/** Called from pipeline.onJobDone when a still job finishes. Failure: nothing to do (jobs.ts refunded the credit). */
export async function onStillDone(ctx: MutationCtx, job: Doc<"jobs">) {
  if (job.status !== "succeeded" || !job.projectId) return;
  const beadId = beadOf(job);
  const out = job.output as { mediaId?: string } | undefined;
  const mid = out?.mediaId ? ctx.db.normalizeId("media", out.mediaId) : null;
  const media = mid ? await ctx.db.get(mid) : null;
  if (!beadId || !media) return;
  if (media.projectId && media.projectId !== job.projectId) return;
  const { w, h } = job.input as { w: number; h: number };
  // the still belongs to the edit from now on: listed with it, deleted with it
  if (!media.projectId) await ctx.db.patch(media._id, { projectId: job.projectId, w, h });
  const head = await headDoc(ctx, job.projectId);
  if (!head) return;
  const change = brollStillChange(head.doc, { beadId, mediaId: media._id, w, h, jobId: job._id });
  if (change) await commitChanges(ctx, job.projectId, [change]);
  await ctx.db.patch(job._id, { meta: { ...(job.meta as object), placed: !!change } });
}

/** Signed URLs for the b-roll stills a doc uses (only this project's media). */
export async function stillUrls(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">, doc: EditDoc): Promise<Record<string, string>> {
  const urls: Record<string, string> = {};
  for (const ref of brollMediaIds(doc)) {
    const id = ctx.db.normalizeId("media", ref);
    const m = id ? await ctx.db.get(id) : null;
    if (!m || m.projectId !== projectId) continue;
    const url = await mediaStore.downloadUrl(ctx, m);
    if (url) urls[ref] = url;
  }
  return urls;
}

export type StillJobView = { jobId: Id<"jobs">; beadId: string; status: Doc<"jobs">["status"]; stage: string; progress: number; error?: string; placed?: boolean };

/**
 * What the editor needs for the b-roll action: whether to show it (approved Pro with a live subscription; credits are
 * checked on the request, so "no credits" is a refusal line, not a hidden button), the cost, and the latest still job
 * per bead. Derived on the server; nothing here unlocks anything.
 */
export const state = query({
  args: { anonId: v.string(), projectId: v.id("projects") },
  handler: async (ctx, a) => {
    const who = await caller(ctx, a.anonId);
    const project = await ctx.db.get(a.projectId);
    if (!project || !owns(project, who)) return null;
    const cost = gpuCreditCost("still");
    const s = await gpuStanding(ctx, who.userId, cost);
    const pro = s.ok || s.code === "credits_required";
    const credits = s.ok ? s.credits : (s.extra?.have ?? 0);
    const latest = new Map<string, StillJobView>();
    for (const j of await stillJobs(ctx, a.projectId)) {
      const beadId = beadOf(j);
      if (!beadId || latest.has(beadId)) continue;
      latest.set(beadId, { jobId: j._id, beadId, status: j.status, stage: j.stage, progress: j.progress, error: j.error, placed: (j.meta as { placed?: boolean } | undefined)?.placed });
    }
    return { pro, cost, credits: pro ? credits : 0, jobs: [...latest.values()] };
  },
});
