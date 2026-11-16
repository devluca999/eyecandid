import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { addClipChange } from "@eyelore/core";
import { caller, owns } from "./lib/owner";
import { commitChanges, createDoc, headDoc } from "./lib/docs";
import { enqueueJob } from "./jobs";
import { mediaStore } from "./lib/mediaStore";

export async function ownedProject(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">, anonId?: string) {
  const p = await ctx.db.get(projectId);
  if (!p || !owns(p, await caller(ctx, anonId))) throw new Error("not found");
  return p;
}

/** Start a project with no signup (ADR 0006). */
export const create = mutation({
  args: { anonId: v.string(), title: v.optional(v.string()) },
  handler: async (ctx, { anonId, title }) => {
    const who = await caller(ctx, anonId);
    const projectId = await ctx.db.insert("projects", {
      ownerUserId: who.userId,
      ownerAnonId: anonId,
      title: title?.slice(0, 80) || "untitled",
      headVersion: 0,
      stage: "empty",
      createdAt: Date.now(),
    });
    await createDoc(ctx, projectId);
    return projectId;
  },
});

export const uploadUrl = mutation({
  args: { anonId: v.string(), projectId: v.id("projects") },
  handler: async (ctx, { anonId, projectId }) => {
    await ownedProject(ctx, projectId, anonId);
    await ctx.db.patch(projectId, { stage: "uploading" });
    return await mediaStore.uploadUrl(ctx);
  },
});

/**
 * Register an uploaded source clip: add it to the edit model and start the pipeline
 * (transcribe → autocut → beads/moments → reframe). The proxy, if any, is registered separately.
 */
export const addSource = mutation({
  args: {
    anonId: v.string(),
    projectId: v.id("projects"),
    storageId: v.id("_storage"),
    contentType: v.string(),
    w: v.number(),
    h: v.number(),
    durationMs: v.number(),
    source: v.union(v.literal("upload"), v.literal("camera"), v.literal("drive")),
    transcribeModel: v.optional(v.union(v.literal("tiny"), v.literal("base"), v.literal("small"))),
  },
  handler: async (ctx, a) => {
    const project = await ownedProject(ctx, a.projectId, a.anonId);
    const meta = await ctx.db.system.get(a.storageId);
    const mediaId = await ctx.db.insert("media", {
      projectId: a.projectId,
      kind: "source",
      storage: { provider: "convex", key: a.storageId },
      contentType: a.contentType,
      bytes: meta?.size,
      w: a.w,
      h: a.h,
      durationMs: a.durationMs,
      createdAt: Date.now(),
    });
    const clipId = `c_${mediaId}`;
    await commitChanges(ctx, a.projectId, [
      addClipChange({ id: clipId, mediaId, source: a.source, w: a.w, h: a.h, durationMs: a.durationMs, fps: 30 }),
    ]);
    await enqueueJob(ctx, {
      type: "transcribe",
      input: { mediaId, model: a.transcribeModel ?? "small" },
      idempotencyKey: `transcribe:${mediaId}`,
      projectId: a.projectId,
      meta: { clipId },
      ownerUserId: project.ownerUserId,
      ownerAnonId: project.ownerAnonId,
    });
    await ctx.db.patch(a.projectId, { stage: "transcribing", stageDetail: "listening" });
    return { mediaId, clipId };
  },
});

/** Low-res proxy made on the client so the editor opens instantly. */
export const addProxy = mutation({
  args: { anonId: v.string(), projectId: v.id("projects"), sourceMediaId: v.id("media"), storageId: v.id("_storage"), contentType: v.string() },
  handler: async (ctx, a) => {
    await ownedProject(ctx, a.projectId, a.anonId);
    const src = await ctx.db.get(a.sourceMediaId);
    if (!src || src.projectId !== a.projectId) throw new Error("not found");
    return await ctx.db.insert("media", {
      projectId: a.projectId,
      kind: "proxy",
      proxyOf: a.sourceMediaId,
      storage: { provider: "convex", key: a.storageId },
      contentType: a.contentType,
      w: src.w,
      h: src.h,
      durationMs: src.durationMs,
      createdAt: Date.now(),
    });
  },
});

type MediaView = { id: Id<"media">; kind: Doc<"media">["kind"]; url: string | null; proxyOf?: Id<"media">; w?: number; h?: number; durationMs?: number };

/** Everything the editor needs, live: the project, the edit doc, media URLs, jobs in flight and exports. */
export const get = query({
  args: { projectId: v.id("projects"), anonId: v.optional(v.string()) },
  handler: async (ctx, { projectId, anonId }) => {
    const project = await ctx.db.get(projectId);
    if (!project || !owns(project, await caller(ctx, anonId))) return null;
    const head = await headDoc(ctx, projectId);
    const mediaRows = await ctx.db.query("media").withIndex("by_project", (q) => q.eq("projectId", projectId)).take(200);
    const media: MediaView[] = [];
    for (const m of mediaRows) {
      media.push({ id: m._id, kind: m.kind, url: await mediaStore.downloadUrl(ctx, m), proxyOf: m.proxyOf, w: m.w, h: m.h, durationMs: m.durationMs });
    }
    const jobs = (await ctx.db.query("jobs").withIndex("by_project", (q) => q.eq("projectId", projectId)).order("desc").take(30)).map((j) => ({
      _id: j._id, type: j.type, status: j.status, progress: j.progress, stage: j.stage, error: j.error, createdAt: j.createdAt, finishedAt: j.finishedAt,
    }));
    const exports = await ctx.db.query("exports").withIndex("by_project", (q) => q.eq("projectId", projectId)).order("desc").take(10);
    const exportViews = [];
    for (const e of exports) {
      const j = await ctx.db.get(e.jobId);
      const out = j?.status === "succeeded" ? (j.output as { mediaId?: string; durationMs?: number } | undefined) : undefined;
      const mid = out?.mediaId ? ctx.db.normalizeId("media", out.mediaId) : null;
      const m = mid ? await ctx.db.get(mid) : null;
      exportViews.push({
        _id: e._id, aspect: e.aspect, maxDurationMs: e.maxDurationMs, watermark: e.watermark, createdAt: e.createdAt,
        status: j?.status ?? "failed", progress: j?.progress ?? 0, stage: j?.stage ?? "", error: j?.error,
        url: m ? await mediaStore.downloadUrl(ctx, m) : null, durationMs: out?.durationMs,
      });
    }
    return {
      project: { _id: project._id, title: project.title, stage: project.stage, stageDetail: project.stageDetail, createdAt: project.createdAt, readyAt: project.readyAt },
      doc: head?.doc ?? null,
      media,
      jobs,
      exports: exportViews,
    };
  },
});

/** Recent projects for this session (mobile list, "continue where you left off"). */
export const mine = query({
  args: { anonId: v.string() },
  handler: async (ctx, { anonId }) => {
    await caller(ctx, anonId);
    return (await ctx.db.query("projects").withIndex("by_owner_anon", (q) => q.eq("ownerAnonId", anonId)).order("desc").take(20)).map((p) => ({
      _id: p._id, title: p.title, stage: p.stage, createdAt: p.createdAt,
    }));
  },
});
