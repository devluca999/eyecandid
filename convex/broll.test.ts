import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { addClipChange, applyChange, beadChanges, brollOverlays, emptyEditDoc, PRO_PLAN, type EditDoc } from "@eyelore/core";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

/** Phase 4: generated b-roll stills for a bead, through the Pro gate and credits, landing in the edit model. */

const modules = import.meta.glob("./**/*.ts");
const ALICE = { subject: "user_alice", email: "alice@example.com" };
const ANON = "anon_" + "d".repeat(32);
type T = ReturnType<typeof convexTest>;
const mk = () => convexTest(schema, modules);

async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
async function worker(t: T, provider: string) {
  const { token } = await t.mutation(internal.workers.register, { name: provider, provider });
  return (await t.mutation(internal.workers.touch, { tokenHash: await sha(token) }))!;
}

async function proUser(t: T, opts: { approved?: boolean; paid?: boolean; credits?: number } = {}) {
  const userId = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
  if (opts.approved !== false) await t.run((ctx) => ctx.db.insert("flags", { key: "pro", enabled: true, rolloutPct: 0, allow: [ALICE.email] }));
  if (opts.paid !== false) {
    await t.mutation(internal.billing.applyStripeEvent, {
      eventId: "evt_checkout",
      type: "checkout.session.completed",
      object: { client_reference_id: userId, metadata: { kind: "plan", plan: PRO_PLAN }, payment_status: "paid", customer: "cus_1", subscription: "sub_1" },
    });
  }
  if (opts.credits !== undefined) {
    await t.run(async (ctx) => {
      const ent = await ctx.db.query("entitlements").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
      await ctx.db.patch(ent!._id, { credits: opts.credits });
    });
  }
  return userId;
}
const credits = (t: T, userId: Id<"users">) =>
  t.run(async (ctx) => (await ctx.db.query("entitlements").withIndex("by_user", (q) => q.eq("userId", userId)).unique())?.credits ?? 0);

const w = (text: string, s: number, e: number) => ({ text, startMs: s, endMs: e, conf: 0.9 });
/** A ready edit with two beads: "this ring tracks my sleep." and "link below." */
function readyDoc(projectId: string): EditDoc {
  let doc = applyChange(emptyEditDoc(projectId), addClipChange({ id: "c1", mediaId: "m1", source: "upload", w: 1080, h: 1920, durationMs: 4000, fps: 30 }))!.doc;
  const transcript = { language: "en", durationMs: 4000, words: [w("this", 0, 300), w("ring", 350, 600), w("tracks", 650, 900), w("my", 950, 1100), w("sleep.", 1150, 1500), w("Link", 2000, 2300), w("below.", 2350, 2800)] };
  for (const c of beadChanges(doc, "c1", transcript, { strikes: [], beads: [{ inMs: 0, outMs: 1500 }, { inMs: 2000, outMs: 2800 }] })) doc = applyChange(doc, c)?.doc ?? doc;
  return doc;
}
async function project(t: T, signedIn = true) {
  const caller = signedIn ? t.withIdentity(ALICE) : t;
  const projectId = await caller.mutation(api.projects.create, { anonId: ANON });
  await t.run(async (ctx) => {
    const row = await ctx.db.query("editDocs").withIndex("by_project", (q) => q.eq("projectId", projectId)).unique();
    const doc = readyDoc(projectId);
    await ctx.db.patch(row!._id, { doc, version: doc.version });
    await ctx.db.patch(projectId, { stage: "ready", headVersion: doc.version });
  });
  return projectId;
}
const head = (t: T, projectId: Id<"projects">) => t.run(async (ctx) => (await ctx.db.query("editDocs").withIndex("by_project", (q) => q.eq("projectId", projectId)).unique())!.doc as EditDoc);
const ask = (t: T, projectId: Id<"projects">, requestId = "r1", beadId = "c1.b0", signedIn = true) =>
  (signedIn ? t.withIdentity(ALICE) : t).mutation(api.broll.requestStill, { anonId: ANON, projectId, beadId, requestId });
const stillJobs = (t: T) => t.run(async (ctx) => (await ctx.db.query("jobs").collect()).filter((j) => j.type === "still"));

/** Plays the GPU worker: stores a fake image the way the worker's upload path does, then completes with it. */
async function finishStill(t: T, workerId: Id<"workers">) {
  const job = await t.mutation(internal.jobs.claim, { workerId, types: ["still"] });
  expect(job).not.toBeNull();
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["png bytes"], { type: "image/png" })));
  const mediaId = await t.mutation(internal.media.registerFromWorker, { storageId, contentType: "image/png", kind: "generated" });
  expect(await t.mutation(internal.jobs.complete, { workerId, jobId: job!.id, output: { mediaId } })).toEqual({ ok: true });
  await t.finishAllScheduledFunctions(() => {});
  return { job: job!, mediaId };
}

describe("broll.requestStill", () => {
  it("Pro with credits: enqueues a still built from the bead's words, sized for the aspect, and charges one credit", async () => {
    const t = mk();
    const userId = await proUser(t, { credits: 3 });
    await worker(t, "modal-gpu");
    const projectId = await project(t);
    const jobId = await ask(t, projectId);
    const [job] = await stillJobs(t);
    expect(job!._id).toBe(jobId);
    expect(job!.input).toMatchObject({ w: 720, h: 1280, refMediaIds: [] });
    expect((job!.input as { prompt: string }).prompt).toContain(`"this ring tracks my sleep."`);
    expect(job!.meta).toEqual({ beadId: "c1.b0" });
    expect(await credits(t, userId)).toBe(2);
    // a replayed request is the same job, charged once; a second request for the same bead while it runs is refused
    expect(await ask(t, projectId)).toBe(jobId);
    await expect(ask(t, projectId, "r2")).rejects.toThrow(/already on its way/);
    expect(await credits(t, userId)).toBe(2);
    const st = await t.withIdentity(ALICE).query(api.broll.state, { anonId: ANON, projectId });
    expect(st).toMatchObject({ pro: true, cost: 1, credits: 2, jobs: [{ beadId: "c1.b0", status: "queued" }] });
  });

  it("refuses anonymous, unapproved and unpaid callers with one line, and writes nothing", async () => {
    const t = mk();
    await worker(t, "modal-gpu");
    const anonProject = await project(t, false);
    await expect(ask(t, anonProject, "a", "c1.b0", false)).rejects.toThrow(/generated media is part of Pro · request access/);
    expect(await t.query(api.broll.state, { anonId: ANON, projectId: anonProject })).toMatchObject({ pro: false, credits: 0 });

    const t2 = mk();
    await worker(t2, "modal-gpu");
    const u2 = await proUser(t2, { approved: false });
    const p2 = await project(t2);
    await expect(ask(t2, p2)).rejects.toThrow(/this account isn't approved yet/);
    expect(await credits(t2, u2)).toBe(50);

    const t3 = mk();
    await worker(t3, "modal-gpu");
    await proUser(t3, { paid: false });
    const p3 = await project(t3);
    await expect(ask(t3, p3)).rejects.toThrow(/needs an active Pro subscription/);
    for (const x of [t, t2, t3]) expect(await stillJobs(x)).toHaveLength(0);
  });

  it("refuses without credits (showing the action, refusing the request), and when no GPU worker exists, without charging", async () => {
    const t = mk();
    const userId = await proUser(t, { credits: 0 });
    await worker(t, "modal-gpu");
    const projectId = await project(t);
    expect(await t.withIdentity(ALICE).query(api.broll.state, { anonId: ANON, projectId })).toMatchObject({ pro: true, credits: 0 });
    await expect(ask(t, projectId)).rejects.toThrow(/this needs 1 credit · you have 0/);

    const t2 = mk();
    const u2 = await proUser(t2, { credits: 2 });
    await worker(t2, "modal"); // only the CPU pool is deployed
    const p2 = await project(t2);
    await expect(ask(t2, p2)).rejects.toThrow(/the gpu isn't set up yet · nothing was charged/);
    expect(await credits(t2, u2)).toBe(2);
    expect(await stillJobs(t2)).toHaveLength(0);
    expect(await credits(t, userId)).toBe(0);
  });

  it("refuses a cut bead and a bead that isn't there", async () => {
    const t = mk();
    await proUser(t, { credits: 2 });
    await worker(t, "modal-gpu");
    const projectId = await project(t);
    await expect(ask(t, projectId, "x", "nope")).rejects.toThrow(/isn't in this edit/);
    await t.withIdentity(ALICE).mutation(api.edits.apply, { anonId: ANON, projectId, baseVersion: (await head(t, projectId)).version, ops: [{ op: "set", path: "/beads/@c1.b1/struck", value: true }], reason: "cut bead" });
    await expect(ask(t, projectId, "y", "c1.b1")).rejects.toThrow(/that bead is cut/);
  });
});

describe("still jobs on the worker side", () => {
  it("only a -gpu worker can claim a still; the CPU worker never sees it, and the GPU worker never takes CPU work", async () => {
    const t = mk();
    await proUser(t, { credits: 2 });
    const gpu = await worker(t, "modal-gpu");
    const cpu = await worker(t, "modal");
    const projectId = await project(t);
    await ask(t, projectId);
    await t.mutation(api.jobs.enqueueHello, { anonId: ANON, message: "hi", requestId: "1" });
    expect(await t.mutation(internal.jobs.claim, { workerId: cpu, types: ["still", "hello"] })).toMatchObject({ type: "hello" });
    expect(await t.mutation(internal.jobs.claim, { workerId: cpu, types: ["still"] })).toBeNull();
    await t.mutation(api.jobs.enqueueHello, { anonId: ANON, message: "hi", requestId: "2" });
    expect(await t.mutation(internal.jobs.claim, { workerId: gpu, types: ["hello"] })).toBeNull();
    expect(await t.mutation(internal.jobs.claim, { workerId: gpu, types: ["hello", "still"] })).toMatchObject({ type: "still" });
  });

  it("completion attaches the still to the edit and places it over the bead as an explained change", async () => {
    const t = mk();
    const userId = await proUser(t, { credits: 2 });
    const gpu = await worker(t, "modal-gpu");
    const projectId = await project(t);
    await ask(t, projectId);
    const { mediaId } = await finishStill(t, gpu);
    const doc = await head(t, projectId);
    expect(doc.tracks.broll).toMatchObject([{ id: "broll.c1.b0", ref: mediaId, params: { beadId: "c1.b0", kind: "still", w: 720, h: 1280 } }]);
    expect(brollOverlays(doc)).toMatchObject([{ beadId: "c1.b0", mediaId, startMs: 0 }]);
    const history = await t.withIdentity(ALICE).query(api.edits.history, { anonId: ANON, projectId });
    expect(history[0]).toMatchObject({ actor: "autopilot:broll", reason: "b-roll · generated still for 'this ring tracks my…'" });
    const view = (await t.withIdentity(ALICE).query(api.projects.get, { projectId, anonId: ANON }))!;
    expect(view.media.find((m) => m.id === mediaId)).toMatchObject({ kind: "generated", w: 720, h: 1280 });
    expect(view.project.stage).toBe("ready");
    expect(await credits(t, userId)).toBe(1); // a success keeps the charge
    expect(await t.withIdentity(ALICE).query(api.broll.state, { anonId: ANON, projectId })).toMatchObject({ jobs: [{ status: "succeeded", placed: true }] });

    // undoable: removing it is your change, and ⌘Z puts it back
    let v = (await head(t, projectId)).version;
    await t.withIdentity(ALICE).mutation(api.edits.apply, { anonId: ANON, projectId, baseVersion: v, ops: [{ op: "remove", path: "/tracks/broll/@broll.c1.b0" }], reason: "removed b-roll · 'this ring tracks my…'" });
    expect((await head(t, projectId)).tracks.broll).toEqual([]);
    v = (await head(t, projectId)).version;
    await t.withIdentity(ALICE).mutation(api.edits.undo, { anonId: ANON, projectId, baseVersion: v });
    expect((await head(t, projectId)).tracks.broll.map((x) => x.ref)).toEqual([mediaId]);
  });

  it("respects a pinned b-roll track: the still is kept with the edit but not placed", async () => {
    const t = mk();
    await proUser(t, { credits: 2 });
    const gpu = await worker(t, "modal-gpu");
    const projectId = await project(t);
    const v = (await head(t, projectId)).version;
    await t.withIdentity(ALICE).mutation(api.edits.apply, { anonId: ANON, projectId, baseVersion: v, ops: [{ op: "set", path: "/tracks/broll", value: [] }], reason: "b-roll · none" });
    await ask(t, projectId);
    await finishStill(t, gpu);
    expect((await head(t, projectId)).tracks.broll).toEqual([]);
    expect(await t.withIdentity(ALICE).query(api.broll.state, { anonId: ANON, projectId })).toMatchObject({ jobs: [{ status: "succeeded", placed: false }] });
  });

  it("a final failure refunds once and leaves the edit alone", async () => {
    const t = mk();
    const userId = await proUser(t, { credits: 1 });
    const gpu = await worker(t, "modal-gpu");
    const projectId = await project(t);
    const jobId = await ask(t, projectId);
    expect(await credits(t, userId)).toBe(0);
    await t.mutation(internal.jobs.claim, { workerId: gpu, types: ["still"] });
    await t.mutation(internal.jobs.fail, { workerId: gpu, jobId, error: "cuda oom", retryable: true }); // maxAttempts 2: requeued
    expect(await credits(t, userId)).toBe(0);
    await t.mutation(internal.jobs.claim, { workerId: gpu, types: ["still"] });
    await t.mutation(internal.jobs.fail, { workerId: gpu, jobId, error: "cuda oom", retryable: true });
    await t.finishAllScheduledFunctions(() => {});
    expect(await credits(t, userId)).toBe(1);
    await t.mutation(internal.jobs.fail, { workerId: gpu, jobId, error: "late", retryable: false });
    expect(await credits(t, userId)).toBe(1);
    const view = (await t.withIdentity(ALICE).query(api.projects.get, { projectId, anonId: ANON }))!;
    expect(view.project.stage).toBe("ready"); // a failed still never fails the edit
    expect((await head(t, projectId)).tracks.broll).toEqual([]);
    expect(await t.withIdentity(ALICE).query(api.broll.state, { anonId: ANON, projectId })).toMatchObject({ jobs: [{ status: "failed", error: "cuda oom" }] });
  });

  it("the on-device export hands the browser signed URLs for the doc's stills", async () => {
    const t = mk();
    await proUser(t, { credits: 1 });
    const gpu = await worker(t, "modal-gpu");
    const projectId = await project(t);
    await ask(t, projectId);
    const { mediaId } = await finishStill(t, gpu);
    await t.run((ctx) => ctx.db.patch(projectId, { engine: "device" }));
    const r = await t.withIdentity(ALICE).mutation(api.pipeline.authorizeDeviceExport, { anonId: ANON, projectId, aspect: "9:16", requestId: "e1", mode: "free" });
    expect(Object.keys(r.stills)).toEqual([mediaId]);
  });
});
