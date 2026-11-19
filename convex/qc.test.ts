import { convexTest } from "convex-test";
import { afterEach, describe, expect, it } from "vitest";
import { addClipChange, applyChange, balance, beadChanges, emptyEditDoc, PRO_PLAN, toTimeline, type EditDoc, type RenderMeasure } from "@eyelore/core";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { ledgerFor } from "./lib/credits";

/** The quality check on every export (convex/qc.ts): safe fixes before, the file's measurements after, qc_failed. */

const modules = import.meta.glob("./**/*.ts");
const ALICE = { subject: "user_alice", email: "alice@example.com" };
const ANON = "anon_" + "e".repeat(32);
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

const w = (text: string, s: number, e: number) => ({ text, startMs: s, endMs: e, conf: 0.9 });
const transcript = { language: "en", durationMs: 4000, words: [w("this", 0, 300), w("ring", 400, 700), w("tracks", 750, 1000), w("my", 1050, 1200), w("sleep.", 1250, 1600), w("Link", 2400, 2700), w("below.", 2750, 3200)] };

/** A ready edit. `strikes` are autocut's; a pause cut running into "ring" (400–700) makes a mid-word cut. */
async function project(t: T, opts: { strikes?: { startMs: number; endMs: number; kind: "silence" | "filler"; reason: string }[]; engine?: "device"; empty?: boolean } = {}) {
  const projectId = await t.mutation(api.projects.create, { anonId: ANON });
  await t.run(async (ctx) => {
    const row = await ctx.db.query("editDocs").withIndex("by_project", (q) => q.eq("projectId", projectId)).unique();
    let doc = applyChange(emptyEditDoc(projectId), addClipChange({ id: "c1", mediaId: "m1", source: "upload", w: 1920, h: 1080, durationMs: 4000, fps: 30 }))!.doc;
    for (const c of beadChanges(doc, "c1", transcript, { strikes: opts.strikes ?? [], beads: [{ inMs: 0, outMs: 1600 }, { inMs: 2400, outMs: 3200 }] })) doc = applyChange(doc, c)?.doc ?? doc;
    if (opts.empty) doc = { ...doc, beads: doc.beads.map((b) => ({ ...b, struck: true })) };
    await ctx.db.patch(row!._id, { doc, version: doc.version });
    await ctx.db.patch(projectId, { stage: "ready", headVersion: doc.version, ...(opts.engine ? { engine: opts.engine } : {}) });
  });
  return projectId;
}
const head = (t: T, p: Id<"projects">) => t.run(async (ctx) => (await ctx.db.query("editDocs").withIndex("by_project", (q) => q.eq("projectId", p)).unique())!.doc as EditDoc);
const startExport = (t: T, p: Id<"projects">) => t.mutation(api.pipeline.startExport, { anonId: ANON, projectId: p, aspect: "9:16", requestId: Math.random().toString(36) });
const view = (t: T, p: Id<"projects">) => t.query(api.projects.get, { anonId: ANON, projectId: p });
const minutes = async (t: T) => (await t.query(api.entitlements.mine, { anonId: ANON })).minutesUsed;

/** Plays the CPU worker: claims the render, stores a file, completes with `measure` (or none, like an older worker). */
async function finishRender(t: T, measure?: (durationMs: number) => RenderMeasure) {
  const workerId = await worker(t, "cpu");
  const job = (await t.mutation(internal.jobs.claim, { workerId, types: ["render"] }))!;
  const doc = (job.input as { doc: EditDoc }).doc;
  const durationMs = toTimeline(doc).durationMs;
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["mp4 bytes"], { type: "video/mp4" })));
  const mediaId = await t.mutation(internal.media.registerFromWorker, { storageId, contentType: "video/mp4", kind: "render" });
  const output = { mediaId, durationMs, qc: { freezes: 0, silentAudio: false, lufs: -14 }, ...(measure ? { measure: measure(durationMs) } : {}) };
  expect(await t.mutation(internal.jobs.complete, { workerId, jobId: job.id, output })).toEqual({ ok: true });
  await t.finishAllScheduledFunctions(() => {});
  return job;
}
const clean = (durationMs: number): RenderMeasure => ({ durationMs, black: [], frozen: [], audio: { peakDb: -1.5, rmsDb: -18, clippedRatio: 0 } });

describe("server render: the file's measurements decide", () => {
  it("a clean file is delivered and counted", async () => {
    const t = mk();
    const p = await project(t);
    await startExport(t, p);
    await finishRender(t, clean);
    const e = (await view(t, p))!.exports[0]!;
    expect(e).toMatchObject({ status: "succeeded", qc: { status: "ok", checked: true, issues: [] } });
    expect(e.url).toBeTruthy();
    expect(await minutes(t)).toBeGreaterThan(0);
  });

  it("black in the file is never delivered or counted, and says why in one line", async () => {
    const t = mk();
    const p = await project(t);
    await startExport(t, p);
    await finishRender(t, (d) => ({ ...clean(d), black: [{ startMs: 500, endMs: 1500 }] }));
    const e = (await view(t, p))!.exports[0]!;
    expect(e.url).toBeNull();
    expect(e.qc).toMatchObject({ status: "blocked", issues: [expect.objectContaining({ code: "black_frames", gate: "block", message: "the picture goes black at 0:00" })] });
    expect(await minutes(t)).toBe(0);
  });

  it("clipping already in the take is held for 'export anyway', which delivers it and counts it", async () => {
    const t = mk();
    const p = await project(t);
    await startExport(t, p);
    const hot = { peakDb: 0, rmsDb: -9, clippedRatio: 0.01 };
    await finishRender(t, (d) => ({ ...clean(d), audio: hot, sources: { c1: { black: [], frozen: [], audio: hot } } }));
    let e = (await view(t, p))!.exports[0]!;
    expect(e.url).toBeNull();
    expect(e.qc).toMatchObject({ status: "ask", issues: [expect.objectContaining({ code: "clipping", ours: false })] });
    expect(await minutes(t)).toBe(0);
    expect(await t.mutation(api.qc.acceptExport, { anonId: ANON, exportId: e._id })).toBe("ok");
    await t.finishAllScheduledFunctions(() => {});
    e = (await view(t, p))!.exports[0]!;
    expect(e.url).toBeTruthy();
    expect(await minutes(t)).toBeGreaterThan(0);
  });

  it("'export anyway' never lifts a block", async () => {
    const t = mk();
    const p = await project(t);
    await startExport(t, p);
    await finishRender(t, (d) => ({ ...clean(d), frozen: [{ startMs: 0, endMs: d }] }));
    const e = (await view(t, p))!.exports[0]!;
    expect(await t.mutation(api.qc.acceptExport, { anonId: ANON, exportId: e._id })).toBe("blocked");
    expect((await view(t, p))!.exports[0]!.url).toBeNull();
  });

  it("an older worker's output without measurements is delivered, marked unchecked", async () => {
    const t = mk();
    const p = await project(t);
    await startExport(t, p);
    await finishRender(t);
    const e = (await view(t, p))!.exports[0]!;
    expect(e.qc).toMatchObject({ status: "ok", checked: false });
    expect(e.url).toBeTruthy();
  });

  it("a finished render reads 'checking' until its check has run, with no link", async () => {
    const t = mk();
    const p = await project(t);
    await startExport(t, p);
    const workerId = await worker(t, "cpu");
    const job = (await t.mutation(internal.jobs.claim, { workerId, types: ["render"] }))!;
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["x"], { type: "video/mp4" })));
    const mediaId = await t.mutation(internal.media.registerFromWorker, { storageId, contentType: "video/mp4", kind: "render" });
    await t.mutation(internal.jobs.complete, { workerId, jobId: job.id, output: { mediaId, durationMs: 1000, qc: { freezes: 0, silentAudio: false, lufs: -14 } } });
    expect((await view(t, p))!.exports[0]).toMatchObject({ status: "running", stage: "checking", url: null });
  });
});

describe("before rendering: safe fixes, then refuse what still blocks", () => {
  it("a cut inside a word moves to the word's edge as an explained autopilot:qc change, recorded on the export", async () => {
    const t = mk();
    const p = await project(t, { strikes: [{ startMs: 320, endMs: 500, kind: "silence", reason: "trimmed pause · 0.2s" }] });
    await startExport(t, p);
    const cut = (await head(t, p)).beads.flatMap((b) => b.cuts).find((c) => c.struck)!;
    expect(cut.endMs).toBeLessThanOrEqual(400); // back out of "ring"
    const ops = await t.run((ctx) => ctx.db.query("editOps").collect());
    expect(ops.filter((o) => o.actor === "autopilot:qc").map((o) => o.reason)).toEqual(["cut moved to a word boundary · keeps 'ring' whole"]);
    expect((await view(t, p))!.exports[0]!.qc).toMatchObject({ status: "pending", fixed: ["cut moved to a word boundary · keeps 'ring' whole"] });
    // the job renders the fixed edit
    const job = (await t.run((ctx) => ctx.db.query("jobs").collect())).find((j) => j.type === "render")!;
    expect((job.input as { doc: EditDoc }).doc.version).toBe((await head(t, p)).version);

    // "put back": the cut returns where it was, as the person's own (pinned) choice; the next export asks, doesn't move it
    expect(await t.mutation(api.qc.undoFix, { anonId: ANON, projectId: p })).toMatchObject({ ok: true });
    const back = (await head(t, p)).beads.flatMap((b) => b.cuts).find((c) => c.struck)!;
    expect(back.endMs).toBe(500);
    await startExport(t, p);
    expect((await t.run((ctx) => ctx.db.query("editOps").collect())).filter((o) => o.actor === "autopilot:qc")).toHaveLength(1);
    expect((await head(t, p)).beads.flatMap((b) => b.cuts).find((c) => c.struck)!.endMs).toBe(500);
  });

  it("an edit with nothing left is refused before anything is rendered or counted", async () => {
    const t = mk();
    const p = await project(t, { empty: true });
    await expect(startExport(t, p)).rejects.toThrow(/qc_blocked/);
    expect(await t.run((ctx) => ctx.db.query("exports").collect())).toEqual([]);
    expect(await t.run((ctx) => ctx.db.query("jobs").collect())).toEqual([]);
  });
});

describe("on-device export", () => {
  it("counts its minutes up front and gives them back when the browser's check blocks it", async () => {
    const t = mk();
    const p = await project(t, { engine: "device" });
    const auth = await t.mutation(api.pipeline.authorizeDeviceExport, { anonId: ANON, projectId: p, aspect: "9:16", requestId: "r1" });
    expect(await minutes(t)).toBeGreaterThan(0);
    const issue = { code: "frozen_frames", atMs: 0, spanMs: 2000, ours: true, gate: "block", message: "the picture freezes at 0:00" };
    expect(await t.mutation(api.qc.recordDevice, { anonId: ANON, exportId: auth.exportId, checked: true, issues: [issue] })).toBe("blocked");
    expect(await minutes(t)).toBe(0);
    // decided once: a second report changes nothing
    expect(await t.mutation(api.qc.recordDevice, { anonId: ANON, exportId: auth.exportId, checked: true, issues: [] })).toBe("blocked");
    expect((await view(t, p))!.exports[0]!.qc).toMatchObject({ status: "blocked", issues: [issue] });
  });

  it("a clean device export keeps its minutes", async () => {
    const t = mk();
    const p = await project(t, { engine: "device" });
    const auth = await t.mutation(api.pipeline.authorizeDeviceExport, { anonId: ANON, projectId: p, aspect: "9:16", requestId: "r1" });
    const before = await minutes(t);
    expect(await t.mutation(api.qc.recordDevice, { anonId: ANON, exportId: auth.exportId, checked: true, issues: [] })).toBe("ok");
    expect(await minutes(t)).toBe(before);
  });
});

describe("qc_failed: a paid result that fails its check releases its credits (ADR 0014)", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
  });

  it("is final (never retried), labelled, and refunds the credit", async () => {
    const t = mk();
    const userId = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    await t.run((ctx) => ctx.db.insert("flags", { key: "pro", enabled: true, rolloutPct: 0, allow: [ALICE.email] }));
    await t.mutation(internal.billing.applyStripeEvent, {
      eventId: "evt_checkout",
      type: "checkout.session.completed",
      object: { client_reference_id: userId, metadata: { kind: "plan", plan: PRO_PLAN }, payment_status: "paid", customer: "cus_1", subscription: "sub_1" },
    });
    await t.run(async (ctx) => {
      const ent = await ctx.db.query("entitlements").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
      await ctx.db.patch(ent!._id, { credits: 3 });
    });
    // the spendable balance across credit lots (ADR 0014), not the legacy entitlements.credits field
    const credits = () => t.run(async (ctx) => balance((await ledgerFor(ctx, userId, Date.now())).lots, Date.now()));
    const start = await credits();
    const gpu = await worker(t, "modal-gpu");
    const projectId = await t.withIdentity(ALICE).mutation(api.projects.create, { anonId: ANON });
    await t.run(async (ctx) => {
      const row = await ctx.db.query("editDocs").withIndex("by_project", (q) => q.eq("projectId", projectId)).unique();
      let doc = applyChange(emptyEditDoc(projectId), addClipChange({ id: "c1", mediaId: "m1", source: "upload", w: 1080, h: 1920, durationMs: 4000, fps: 30 }))!.doc;
      for (const c of beadChanges(doc, "c1", transcript, { strikes: [], beads: [{ inMs: 0, outMs: 1600 }, { inMs: 2400, outMs: 3200 }] })) doc = applyChange(doc, c)?.doc ?? doc;
      await ctx.db.patch(row!._id, { doc, version: doc.version });
      await ctx.db.patch(projectId, { stage: "ready", headVersion: doc.version });
    });
    await t.withIdentity(ALICE).mutation(api.broll.requestStill, { anonId: ANON, projectId, beadId: "c1.b0", requestId: "r1" });
    expect(await credits()).toBe(start - 1);
    const job = (await t.mutation(internal.jobs.claim, { workerId: gpu, types: ["still"] }))!;
    // retryable is ignored for qc_failed: the result was bad, running it again on the same input isn't the answer
    expect(await t.mutation(internal.jobs.fail, { workerId: gpu, jobId: job.id, error: "the still came out blank", retryable: true, outcome: "qc_failed" })).toBe(true);
    await t.finishAllScheduledFunctions(() => {});
    const row = (await t.run((ctx) => ctx.db.query("jobs").collect())).find((j) => j.type === "still")!;
    expect(row).toMatchObject({ status: "failed", stage: "failed · quality check", error: "the still came out blank" });
    expect(await credits()).toBe(start);
  });
});
