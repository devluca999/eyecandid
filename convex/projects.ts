import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { addClipChange } from "@eyelore/core";
import { caller, owns } from "./lib/owner";
import { addUsage } from "./lib/entitle";
import { commitChanges, createDoc, headDoc } from "./lib/docs";
import { enqueueJob } from "./jobs";
import { mediaIdsIn, mediaStore } from "./lib/mediaStore";

export async function ownedProject(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">, anonId?: string) {
  const p = await ctx.db.get(projectId);
  if (!p || !owns(p, await caller(ctx, anonId))) throw new Error("not found");
  return p;
}

/** Start a project with no signup (ADR 0006). */
export const create = mutation({
  args: { anonId: v.string(), title: v.optional(v.string()), script: v.optional(v.array(v.string())) },
  handler: async (ctx, { anonId, title, script }) => {
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
    const lines = (script ?? []).map((l) => l.trim().slice(0, 300)).filter(Boolean).slice(0, 60);
    if (lines.length) {
      await commitChanges(ctx, projectId, [{ actor: "user", reason: `script · ${lines.length} line${lines.length === 1 ? "" : "s"}`, ops: [{ op: "set", path: "/script", value: lines }] }]);
    }
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

const PURGE_BATCH = 300;

/** Delete a media row and its stored bytes. Only media of this project, or worker output that belongs to no project. */
async function dropMedia(ctx: MutationCtx, projectId: Id<"projects">, mediaId: string | undefined) {
  const id = mediaId ? ctx.db.normalizeId("media", mediaId) : null;
  const m = id ? await ctx.db.get(id) : null;
  if (!m || (m.projectId && m.projectId !== projectId)) return;
  await mediaStore.delete(ctx, m);
  await ctx.db.delete(m._id);
}

/**
 * Remove everything that hangs off a project, a batch per table. Returns true when nothing is left.
 * Jobs a worker is running right now are kept as `canceled` shells with the user's content stripped: the worker's next
 * heartbeat or progress call gets "stale lease" and it stops; anything it registers late is removed in jobs.ts.
 */
async function purge(ctx: MutationCtx, projectId: Id<"projects">): Promise<boolean> {
  let more = false;
  const exportRows = await ctx.db.query("exports").withIndex("by_project", (q) => q.eq("projectId", projectId)).take(PURGE_BATCH);
  for (const e of exportRows) {
    // a render that succeeded before the delete still used its minutes (ADR 0009); one that did not, did not
    if (!e.usageCounted) {
      const j = await ctx.db.get(e.jobId);
      if (j?.status === "succeeded") await addUsage(ctx, { userId: e.chargedUserId, anonHash: e.chargedAnonHash }, ((j.output as { durationMs?: number } | undefined)?.durationMs ?? 0) / 60_000);
    }
    await ctx.db.delete(e._id);
  }
  more ||= exportRows.length === PURGE_BATCH;

  // presence beats and "your edit is ready" notifications belong to the edit; accountClaims is an audit log and stays
  const beats = await ctx.db.query("presence").withIndex("by_project", (q) => q.eq("projectId", projectId)).take(PURGE_BATCH);
  for (const b of beats) await ctx.db.delete(b._id);
  more ||= beats.length === PURGE_BATCH;
  const notes = await ctx.db.query("notifications").withIndex("by_project", (q) => q.eq("projectId", projectId)).take(PURGE_BATCH);
  for (const n of notes) await ctx.db.delete(n._id);
  more ||= notes.length === PURGE_BATCH;

  const jobs = await ctx.db.query("jobs").withIndex("by_project", (q) => q.eq("projectId", projectId)).take(PURGE_BATCH);
  for (const j of jobs) {
    for (const mid of [...mediaIdsIn(j.output), j.previewMediaId]) await dropMedia(ctx, projectId, mid);
    if (j.status === "leased" || j.status === "running") {
      await ctx.db.patch(j._id, {
        status: "canceled", stage: "canceled · edit deleted", finishedAt: Date.now(),
        input: {}, output: undefined, meta: undefined, error: undefined, previewMediaId: undefined, projectId: undefined,
      });
    } else await ctx.db.delete(j._id);
  }
  more ||= jobs.length === PURGE_BATCH;

  const ops = await ctx.db.query("editOps").withIndex("by_project_version", (q) => q.eq("projectId", projectId)).take(PURGE_BATCH);
  for (const o of ops) await ctx.db.delete(o._id);
  more ||= ops.length === PURGE_BATCH;

  const docs = await ctx.db.query("editDocs").withIndex("by_project", (q) => q.eq("projectId", projectId)).take(PURGE_BATCH);
  for (const d of docs) await ctx.db.delete(d._id);
  more ||= docs.length === PURGE_BATCH;

  const media = await ctx.db.query("media").withIndex("by_project", (q) => q.eq("projectId", projectId)).take(PURGE_BATCH);
  for (const m of media) await dropMedia(ctx, projectId, m._id);
  more ||= media.length === PURGE_BATCH;
  return !more;
}

/**
 * Delete an edit for good: the project, its edit doc and change log, exports, jobs, and every stored file
 * (the source clip, proxies, renders). Only its owner can; there is no undo.
 */
export const remove = mutation({
  args: { projectId: v.id("projects"), anonId: v.optional(v.string()) },
  handler: async (ctx, { projectId, anonId }) => {
    await ownedProject(ctx, projectId, anonId);
    await ctx.db.delete(projectId); // gone for the owner at once, even if the sweep below needs another pass
    if (!(await purge(ctx, projectId))) await ctx.scheduler.runAfter(0, internal.projects.purgeRest, { projectId });
    return null;
  },
});

/** Continues a delete that was too large for one transaction. */
export const purgeRest = internalMutation({
  args: { projectId: v.id("projects") },
  handler: async (ctx, { projectId }) => {
    if (await ctx.db.get(projectId)) return; // never sweep a project that still exists
    if (!(await purge(ctx, projectId))) await ctx.scheduler.runAfter(0, internal.projects.purgeRest, { projectId });
  },
});
