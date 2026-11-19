import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
const ANON = "anon_" + "e".repeat(32);
const OTHER = "anon_" + "f".repeat(32);
type T = ReturnType<typeof convexTest>;

async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function worker(t: T) {
  const { token } = await t.mutation(internal.workers.register, { name: "w", provider: "cpu-stub" });
  return (await t.mutation(internal.workers.touch, { tokenHash: await sha(token) }))!;
}
async function claim(t: T, workerId: Id<"workers">, type: string) {
  const job = await t.mutation(internal.jobs.claim, { workerId, types: [type] });
  expect(job, `expected a queued ${type} job`).not.toBeNull();
  return job!;
}
async function work(t: T, workerId: Id<"workers">, type: string, output: unknown) {
  const job = await claim(t, workerId, type);
  expect((await t.mutation(internal.jobs.complete, { workerId, jobId: job.id, output })).ok).toBe(true);
  await t.finishAllScheduledFunctions(() => {});
  return job;
}
/** What a worker does with a finished file: store the bytes, then register them as media (no projectId). */
async function workerUpload(t: T, kind: "render" | "preview") {
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob([`${kind} bytes`], { type: "video/mp4" })));
  return await t.mutation(internal.media.registerFromWorker, { storageId, contentType: "video/mp4", kind });
}
const words = [
  { text: "Um,", startMs: 0, endMs: 300, conf: 0.8 }, { text: "this", startMs: 400, endMs: 600, conf: 0.9 },
  { text: "ring", startMs: 650, endMs: 900, conf: 0.9 }, { text: "works.", startMs: 950, endMs: 1400, conf: 0.9 },
];
const autocut = { strikes: [{ startMs: 0, endMs: 300, kind: "filler", reason: "trimmed filler · 'um'" }], beads: [{ inMs: 0, outMs: 1400, moment: "hook" }] };

/** A project taken through upload → ready, with a proxy. */
async function readyProject(t: T, workerId: Id<"workers">, anonId = ANON) {
  const projectId = await t.mutation(api.projects.create, { anonId, title: "random video" });
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["source bytes"], { type: "video/mp4" })));
  const { mediaId } = await t.mutation(api.projects.addSource, { anonId, projectId, storageId, contentType: "video/mp4", w: 640, h: 360, durationMs: 1500, source: "upload" });
  const proxyStorage = await t.run((ctx) => ctx.storage.store(new Blob(["proxy bytes"], { type: "video/mp4" })));
  await t.mutation(api.projects.addProxy, { anonId, projectId, sourceMediaId: mediaId, storageId: proxyStorage, contentType: "video/mp4" });
  await work(t, workerId, "transcribe", { language: "en", words, durationMs: 1500 });
  await work(t, workerId, "autocut", autocut);
  return projectId;
}
async function counts(t: T) {
  return await t.run(async (ctx) => ({
    projects: (await ctx.db.query("projects").collect()).length,
    editDocs: (await ctx.db.query("editDocs").collect()).length,
    editOps: (await ctx.db.query("editOps").collect()).length,
    editLabels: (await ctx.db.query("editLabels").collect()).length,
    exports: (await ctx.db.query("exports").collect()).length,
    jobs: (await ctx.db.query("jobs").collect()).length,
    media: (await ctx.db.query("media").collect()).length,
    files: (await ctx.db.system.query("_storage").collect()).length,
  }));
}
const NOTHING = { projects: 0, editDocs: 0, editOps: 0, editLabels: 0, exports: 0, jobs: 0, media: 0, files: 0 };

describe("deleting an edit", () => {
  it("the owner deletes it and every row and stored file is gone, the rendered export included", async () => {
    const t = convexTest(schema, modules);
    const workerId = await worker(t);
    const projectId = await readyProject(t, workerId);
    await work(t, workerId, "reframe", { keyframes: [{ ms: 0, cx: 0.5, cy: 0.5, scale: 1 }], faces: 3 });
    // a finished export: the render is registered by the worker, linked to the project only through the job's output
    await t.mutation(api.pipeline.startExport, { anonId: ANON, projectId, aspect: "9:16", requestId: "e1" });
    const renderMediaId = await workerUpload(t, "render");
    await work(t, workerId, "render", { mediaId: renderMediaId, durationMs: 1100, qc: { freezes: 0, silentAudio: false, lufs: -14 } });
    expect((await t.query(api.projects.get, { projectId, anonId: ANON }))!.exports[0]!.url).toBeTruthy();
    // a second export still waiting in the queue
    await t.mutation(api.pipeline.startExport, { anonId: ANON, projectId, aspect: "1:1", requestId: "e2" });

    await t.run((ctx) => ctx.db.insert("editLabels", { projectId, kind: "restore", atMs: 0, spanMs: 100, strikeKind: "filler", docVersion: 1, at: Date.now(), owner: "a:x" }));
    const before = await counts(t);
    expect(before).toMatchObject({ projects: 1, editDocs: 1, editLabels: 1, exports: 2, media: 3, files: 3 });
    expect(before.jobs).toBe(5); // transcribe, autocut, reframe, render (done), render (queued)
    expect(before.editOps).toBeGreaterThan(0);

    await t.mutation(api.projects.remove, { projectId, anonId: ANON });
    await t.finishAllScheduledFunctions(() => {});

    expect(await counts(t)).toEqual(NOTHING);
    expect(await t.query(api.projects.get, { projectId, anonId: ANON })).toBeNull();
    expect(await t.query(api.projects.mine, { anonId: ANON })).toEqual([]);
    expect(await t.mutation(internal.jobs.claim, { workerId, types: ["render"] })).toBeNull(); // the queued export never runs
    await expect(t.mutation(api.projects.remove, { projectId, anonId: ANON })).rejects.toThrow("not found");
  });

  it("someone else can't delete it, and nothing is removed", async () => {
    const t = convexTest(schema, modules);
    const projectId = await readyProject(t, await worker(t));
    await t.run((ctx) => ctx.db.insert("editLabels", { projectId, kind: "restore", atMs: 0, spanMs: 100, strikeKind: "filler", docVersion: 1, at: Date.now(), owner: "a:x" }));
    const before = await counts(t);
    await expect(t.mutation(api.projects.remove, { projectId, anonId: OTHER })).rejects.toThrow("not found");
    await expect(t.mutation(api.projects.remove, { projectId })).rejects.toThrow("not found"); // no session at all
    await expect(t.withIdentity({ subject: "user_stranger" }).mutation(api.projects.remove, { projectId })).rejects.toThrow("not found");
    expect(await counts(t)).toEqual(before);
    expect(await t.query(api.projects.get, { projectId, anonId: ANON })).not.toBeNull();
  });

  it("only that edit goes: the owner's other edit, and another person's, are untouched", async () => {
    const t = convexTest(schema, modules);
    const workerId = await worker(t);
    // free sessions run one job at a time (convex/lib/limits.ts): let the background reframe finish before the next edit
    const settle = () => t.run(async (ctx) => { for (const j of await ctx.db.query("jobs").collect()) if (j.status === "queued") await ctx.db.patch(j._id, { status: "succeeded" }); });
    const mine = await readyProject(t, workerId);
    await settle();
    const kept = await readyProject(t, workerId);
    await settle();
    const theirs = await readyProject(t, workerId, OTHER);
    const one = await counts(t);
    await t.mutation(api.projects.remove, { projectId: mine, anonId: ANON });
    await t.finishAllScheduledFunctions(() => {});
    const after = await counts(t);
    expect(after.projects).toBe(2);
    expect(after.files).toBe(one.files - 2); // source + proxy of the deleted edit only
    expect(after.media).toBe(one.media - 2);
    for (const [projectId, anonId] of [[kept, ANON], [theirs, OTHER]] as const) {
      const view = (await t.query(api.projects.get, { projectId, anonId }))!;
      expect(view.doc!.beads).toHaveLength(1);
      expect(view.media.every((m) => m.url)).toBe(true);
    }
  });

  it("a signed-in owner can delete from another device (no anon id)", async () => {
    const t = convexTest(schema, modules);
    const projectId = await readyProject(t, await worker(t));
    const userId = await t.run((ctx) => ctx.db.insert("users", { clerkId: "user_owner", plan: "free", createdAt: 1 }));
    await t.run((ctx) => ctx.db.patch(projectId, { ownerUserId: userId }));
    await t.withIdentity({ subject: "user_owner" }).mutation(api.projects.remove, { projectId });
    await t.finishAllScheduledFunctions(() => {});
    expect(await counts(t)).toMatchObject({ projects: 0, editDocs: 0, editOps: 0, jobs: 0, media: 0, files: 0 });
  });

  it("a render in flight is canceled: the worker is told to stop, and what it uploads late is removed", async () => {
    const t = convexTest(schema, modules);
    const workerId = await worker(t);
    const projectId = await readyProject(t, workerId);
    await t.mutation(internal.jobs.claim, { workerId, types: ["reframe"] }).then((j) => t.mutation(internal.jobs.fail, { workerId, jobId: j!.id, error: "x", retryable: false }));
    await t.mutation(api.pipeline.startExport, { anonId: ANON, projectId, aspect: "9:16", requestId: "e1" });
    const job = await claim(t, workerId, "render");
    expect(await t.mutation(internal.jobs.progress, { workerId, jobId: job.id, progress: 0.3, stage: "rendering" })).toBe(true);

    await t.mutation(api.projects.remove, { projectId, anonId: ANON });
    await t.finishAllScheduledFunctions(() => {});

    // the shell that is left holds none of the user's content
    const shell = (await t.run((ctx) => ctx.db.query("jobs").collect()))[0]!;
    expect(shell).toMatchObject({ status: "canceled", input: {} });
    expect(shell.output).toBeUndefined();
    expect(shell.projectId).toBeUndefined();
    expect(await counts(t)).toMatchObject({ projects: 0, editDocs: 0, editOps: 0, exports: 0, jobs: 1, media: 0, files: 0 });

    // the worker's next heartbeat and progress are refused (it drops the job)…
    expect(await t.mutation(internal.jobs.heartbeat, { workerId, jobId: job.id })).toBeNull();
    expect(await t.mutation(internal.jobs.progress, { workerId, jobId: job.id, progress: 0.9, stage: "encoding" })).toBe(false);
    // …and if it had already uploaded the render, completing removes that file and the shell
    const lateMediaId = await workerUpload(t, "render");
    expect((await counts(t)).files).toBe(1);
    const r = await t.mutation(internal.jobs.complete, { workerId, jobId: job.id, output: { mediaId: lateMediaId, durationMs: 1000, qc: { freezes: 0, silentAudio: false, lufs: -14 } } });
    expect(r.ok).toBe(false);
    expect(await counts(t)).toEqual(NOTHING);
  });

  it("a large edit is swept in more than one pass", async () => {
    const t = convexTest(schema, modules);
    const projectId = await t.mutation(api.projects.create, { anonId: ANON });
    await t.run(async (ctx) => {
      for (let i = 0; i < 650; i++) await ctx.db.insert("editOps", { projectId, version: i + 1, ops: [], reason: "x", actor: "user", at: i });
    });
    await t.mutation(api.projects.remove, { projectId, anonId: ANON });
    expect((await counts(t)).editOps).toBe(350); // first pass
    await t.finishAllScheduledFunctions(() => {});
    expect(await counts(t)).toEqual(NOTHING);
  });
});
