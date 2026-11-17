import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import { addClipChange, autocut, beadChanges, JOB_SPECS, reframeChange, retakeChanges } from "@eyelore/core";
import { caller, owns } from "./lib/owner";
import { addUsage, refundJobCredits, usageFor } from "./lib/entitle";
import { admitFreeJob, freeState, MSG, rateLimit, refuse, sourceRefusal } from "./lib/limits";
import { commitChanges, createDoc, headDoc } from "./lib/docs";
import { enqueueJob } from "./jobs";
import { mediaIdsIn, mediaStore } from "./lib/mediaStore";

export async function ownedProject(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">, anonId?: string) {
  const p = await ctx.db.get(projectId);
  if (!p || !owns(p, await caller(ctx, anonId))) throw new Error("not found");
  return p;
}

/**
 * Would this clip be refused? Asked on the landing before a project exists, so a clip over the cap or a paused free
 * day is said there, in one line, instead of after an editor opened and an upload ran. Only a courtesy: the same
 * rules are enforced again where it counts (addSource, addDeviceSource, uploadUrl).
 */
export const preflight = query({
  args: { anonId: v.string(), durationMs: v.number(), bytes: v.number(), onDevice: v.boolean() },
  handler: async (ctx, a): Promise<string | null> => {
    const pro = (await usageFor(ctx, await caller(ctx, a.anonId))).plan !== "free";
    // nothing is uploaded on device, so size isn't capped there (same as addDeviceSource)
    const why = sourceRefusal({ pro, size: a.onDevice ? 0 : a.bytes, durationMs: a.durationMs });
    if (why) return why;
    if (!pro && !a.onDevice && (await freeState(ctx)).paused) return MSG.paused;
    return null;
  },
});

/** Start a project with no signup (ADR 0006). */
export const create = mutation({
  args: { anonId: v.string(), title: v.optional(v.string()), script: v.optional(v.array(v.string())), clientHint: v.optional(v.string()) },
  handler: async (ctx, { anonId, title, script, clientHint }) => {
    const who = await caller(ctx, anonId);
    await rateLimit(ctx, "create", { anonId, clientHint });
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
  args: { anonId: v.string(), projectId: v.id("projects"), clientHint: v.optional(v.string()) },
  handler: async (ctx, { anonId, projectId, clientHint }) => {
    await ownedProject(ctx, projectId, anonId);
    await rateLimit(ctx, "uploadUrl", { anonId, clientHint });
    // don't take bytes we would refuse: a paused or full free day says so before the upload, not after
    const pro = (await usageFor(ctx, await caller(ctx, anonId))).plan !== "free";
    if (!pro) await admitFreeJob(ctx, { count: false });
    await ctx.db.patch(projectId, { stage: "uploading" });
    return await mediaStore.uploadUrl(ctx);
  },
});

/**
 * Free caps, enforced here and nowhere else (the client only shows the message). Size comes from Convex's `_storage`
 * metadata, never the client. Duration is the client's probe: the server cannot decode video in a mutation, so it
 * is a guard, not a proof (the worker's transcribe output carries the real duration).
 * Known gap: a thrown refusal rolls back the whole mutation, so the refused upload's bytes cannot be deleted here;
 * they stay in storage until an orphan sweep exists (not built). Upload URLs are rate limited and gated meanwhile.
 */
async function enforceSourceCaps(
  ctx: MutationCtx,
  a: { anonId: string; storageId: Id<"_storage">; durationMs: number },
  project: Doc<"projects">,
  size: number | undefined,
) {
  const pro = (await usageFor(ctx, await caller(ctx, a.anonId))).plan !== "free";
  const why = sourceRefusal({ pro, size, durationMs: a.durationMs });
  if (why) refuse(why);
  if (pro) return;
  // one pipeline job in flight per anonymous session
  const mine = await ctx.db.query("jobs").withIndex("by_owner_anon", (q) => q.eq("ownerAnonId", project.ownerAnonId ?? a.anonId)).order("desc").take(50);
  if (mine.some((j) => j.status === "queued" || j.status === "leased" || j.status === "running")) refuse(MSG.busy);
  await admitFreeJob(ctx, { count: true });
}

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
    await enforceSourceCaps(ctx, a, project, meta?.size);
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
  // a string, not v.id: a mistyped or truncated edit link is "not found", not a crash
  args: { projectId: v.string(), anonId: v.optional(v.string()) },
  handler: async (ctx, { projectId: raw, anonId }) => {
    const projectId = ctx.db.normalizeId("projects", raw);
    if (!projectId) return null;
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
      if (!e.jobId) {
        // rendered in the visitor's browser: the file only ever existed there
        exportViews.push({ _id: e._id, aspect: e.aspect, maxDurationMs: e.maxDurationMs, watermark: e.watermark, createdAt: e.createdAt, status: "succeeded" as const, progress: 1, stage: "on this device", error: undefined, url: null, durationMs: undefined, device: true });
        continue;
      }
      const j = await ctx.db.get(e.jobId);
      const out = j?.status === "succeeded" ? (j.output as { mediaId?: string; durationMs?: number } | undefined) : undefined;
      const mid = out?.mediaId ? ctx.db.normalizeId("media", out.mediaId) : null;
      const m = mid ? await ctx.db.get(mid) : null;
      exportViews.push({
        _id: e._id, aspect: e.aspect, maxDurationMs: e.maxDurationMs, watermark: e.watermark, createdAt: e.createdAt,
        status: j?.status ?? "failed", progress: j?.progress ?? 0, stage: j?.stage ?? "", error: j?.error,
        url: m ? await mediaStore.downloadUrl(ctx, m) : null, durationMs: out?.durationMs, device: false,
      });
    }
    return {
      project: { _id: project._id, title: project.title, stage: project.stage, stageDetail: project.stageDetail, createdAt: project.createdAt, readyAt: project.readyAt, engine: project.engine ?? "server" },
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
    if (!e.usageCounted && e.jobId) {
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
    // a paid job that will now never deliver gives its credits back (nothing to do for free or already-refunded jobs)
    if (j.status !== "succeeded") await refundJobCredits(ctx, j._id);
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

// ───────────── on-device engine (free tier, ADR 0012) ─────────────

/**
 * A clip that stays on the visitor's device: the browser transcribes it (Whisper on WebGPU) and renders exports
 * itself. Convex still holds the project and the edit model, so every decision is explained and undoable.
 */
export const addDeviceSource = mutation({
  args: {
    anonId: v.string(),
    projectId: v.id("projects"),
    contentType: v.string(),
    w: v.number(),
    h: v.number(),
    durationMs: v.number(),
    bytes: v.number(),
  },
  handler: async (ctx, a) => {
    await ownedProject(ctx, a.projectId, a.anonId);
    // the free length cap is a product rule, so it holds on device too (size isn't capped: nothing is uploaded)
    const pro = (await usageFor(ctx, await caller(ctx, a.anonId))).plan !== "free";
    const why = sourceRefusal({ pro, size: 0, durationMs: a.durationMs });
    if (why) refuse(why);
    const mediaId = await ctx.db.insert("media", {
      projectId: a.projectId,
      kind: "source",
      storage: { provider: "device", key: "local" },
      contentType: a.contentType,
      bytes: a.bytes,
      w: a.w,
      h: a.h,
      durationMs: a.durationMs,
      createdAt: Date.now(),
    });
    const clipId = `c_${mediaId}`;
    await commitChanges(ctx, a.projectId, [
      addClipChange({ id: clipId, mediaId, source: "upload", w: a.w, h: a.h, durationMs: a.durationMs, fps: 30 }),
    ]);
    await ctx.db.patch(a.projectId, { engine: "device", stage: "transcribing", stageDetail: "on this device" });
    return { mediaId, clipId };
  },
});

/** Live progress from the device (model download, listening) so the stage line stays honest across reloads. */
export const deviceProgress = mutation({
  args: { anonId: v.string(), projectId: v.id("projects"), detail: v.string() },
  handler: async (ctx, a) => {
    const p = await ownedProject(ctx, a.projectId, a.anonId);
    if (p.engine !== "device" || p.stage === "ready") return;
    await ctx.db.patch(a.projectId, { stageDetail: a.detail.slice(0, 120) });
  },
});

/**
 * The device's transcript lands here; autocut, beads, moments and retakes run server-side from the same pure code the
 * worker path uses, so both engines produce the same explained changes. The transcript is validated against the
 * engine contract (it is client input).
 */
export const applyDeviceTranscript = mutation({
  args: { anonId: v.string(), projectId: v.id("projects"), clipId: v.string(), transcript: v.any() },
  handler: async (ctx, a) => {
    const p = await ownedProject(ctx, a.projectId, a.anonId);
    if (p.engine !== "device") throw new Error("not an on-device edit");
    if (p.stage === "ready") return { ok: true as const, already: true };
    const transcript = JOB_SPECS.transcribe.output.parse(a.transcript);
    if (transcript.words.length > 6000) throw new Error("transcript too long");
    const head = await headDoc(ctx, a.projectId);
    if (!head || !head.doc.clips.some((c) => c.id === a.clipId)) throw new Error("unknown clip");
    const cut = autocut({ words: transcript.words });
    await commitChanges(ctx, a.projectId, beadChanges(head.doc, a.clipId, transcript, cut));
    const after = await headDoc(ctx, a.projectId);
    if (after) {
      const retakes = retakeChanges(after.doc);
      if (retakes.length) await commitChanges(ctx, a.projectId, retakes);
    }
    await ctx.db.patch(a.projectId, { stage: "ready", stageDetail: undefined, readyAt: Date.now() });
    return { ok: true as const, already: false };
  },
});

/**
 * The browser's face pass (MediaPipe, ADR 0012) lands after the edit is already ready, like the server's background
 * reframe. Keyframes are client input, so they are validated and bounded; the same reframeChange the worker path uses
 * records "reframed · keeps your face centred" in history. Export uses whatever reframe the doc has at that moment.
 */
export const applyDeviceReframe = mutation({
  args: { anonId: v.string(), projectId: v.id("projects"), clipId: v.string(), keyframes: v.any(), faces: v.number() },
  handler: async (ctx, a) => {
    const p = await ownedProject(ctx, a.projectId, a.anonId);
    if (p.engine !== "device") throw new Error("not an on-device edit");
    const out = JOB_SPECS.reframe.output.parse({ keyframes: a.keyframes, faces: a.faces });
    if (out.keyframes.length === 0 || out.keyframes.length > 2000) throw new Error("bad keyframes");
    const head = await headDoc(ctx, a.projectId);
    if (!head || !head.doc.clips.some((c) => c.id === a.clipId)) throw new Error("unknown clip");
    await commitChanges(ctx, a.projectId, [reframeChange(a.clipId, out.keyframes, out.faces)]);
    return { ok: true as const };
  },
});

/** The device couldn't finish (no speech found, out of memory, tab closed mid-way): say so on the project. */
export const deviceFailed = mutation({
  args: { anonId: v.string(), projectId: v.id("projects"), reason: v.string() },
  handler: async (ctx, a) => {
    const p = await ownedProject(ctx, a.projectId, a.anonId);
    if (p.engine !== "device" || p.stage === "ready") return;
    await ctx.db.patch(a.projectId, { stage: "failed", stageDetail: a.reason.slice(0, 160) });
  },
});

/** "leave your email and we'll send it when it's ready": one address, for this edit only (server pipeline). */
export const setReadyEmail = mutation({
  args: { anonId: v.string(), projectId: v.id("projects"), email: v.string() },
  handler: async (ctx, a) => {
    const p = await ownedProject(ctx, a.projectId, a.anonId);
    const email = a.email.trim().toLowerCase();
    if (email.length > 200 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("that email doesn't look right");
    if (p.engine === "device") throw new Error("this edit happens in your browser · keep the tab open");
    await ctx.db.patch(a.projectId, { readyEmail: email });
    return { ok: true as const, alreadyReady: p.stage === "ready" };
  },
});
