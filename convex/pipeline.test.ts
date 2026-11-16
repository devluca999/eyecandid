import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
const ANON = "anon_" + "c".repeat(32);

async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** Plays the worker: claims the next job of `type` and completes it with `output`. */
async function work(t: ReturnType<typeof convexTest>, workerId: Id<"workers">, type: string, output: (input: any) => unknown) {
  const job = await t.mutation(internal.jobs.claim, { workerId, types: [type] });
  expect(job, `expected a queued ${type} job`).not.toBeNull();
  const r = await t.mutation(internal.jobs.complete, { workerId, jobId: job!.id, output: output(job!.input) });
  expect(r.ok).toBe(true);
  await t.finishAllScheduledFunctions(() => {});
  return job!;
}

const words = [
  { text: "Um,", startMs: 0, endMs: 300, conf: 0.8 }, { text: "this", startMs: 400, endMs: 600, conf: 0.9 }, { text: "ring", startMs: 650, endMs: 900, conf: 0.9 },
  { text: "tracks", startMs: 950, endMs: 1200, conf: 0.9 }, { text: "sleep.", startMs: 1250, endMs: 1700, conf: 0.9 },
  { text: "It", startMs: 3300, endMs: 3400, conf: 0.95 }, { text: "lasts", startMs: 3450, endMs: 3700, conf: 0.95 }, { text: "a", startMs: 3750, endMs: 3800, conf: 0.95 },
  { text: "week.", startMs: 3850, endMs: 4200, conf: 0.95 }, { text: "Link", startMs: 4500, endMs: 4800, conf: 0.9 }, { text: "below.", startMs: 4850, endMs: 5300, conf: 0.9 },
];

describe("core-loop pipeline", () => {
  it("upload → transcribe → autocut → ready (beads, strikes, moments) → reframe → export", async () => {
    const t = convexTest(schema, modules);
    const { token } = await t.mutation(internal.workers.register, { name: "w", provider: "cpu-stub" });
    const workerId = (await t.mutation(internal.workers.touch, { tokenHash: await sha(token) }))!;

    const projectId = await t.mutation(api.projects.create, { anonId: ANON });
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["fake video"], { type: "video/mp4" })));
    await t.mutation(api.projects.addSource, { anonId: ANON, projectId, storageId, contentType: "video/mp4", w: 640, h: 360, durationMs: 5500, source: "upload" });
    expect((await t.query(api.projects.get, { projectId, anonId: ANON }))!.project.stage).toBe("transcribing");

    await work(t, workerId, "transcribe", () => ({ language: "en", words, durationMs: 5500 }));
    expect((await t.query(api.projects.get, { projectId, anonId: ANON }))!.project.stage).toBe("cutting");

    // the real autocut handler's shape (services/engine/eyelore_engine/handlers/autocut.py)
    await work(t, workerId, "autocut", (input) => {
      expect(input.words).toHaveLength(words.length);
      return {
        strikes: [
          { startMs: 0, endMs: 300, kind: "filler", reason: "trimmed filler · 'um'" },
          { startMs: 1820, endMs: 3180, kind: "silence", reason: "trimmed pause · 1.6s" },
        ],
        beads: [{ inMs: 0, outMs: 1700, moment: "hook" }, { inMs: 3300, outMs: 4200 }, { inMs: 4500, outMs: 5300, moment: "cta" }],
      };
    });
    let view = (await t.query(api.projects.get, { projectId, anonId: ANON }))!;
    expect(view.project.stage).toBe("ready");
    expect(view.doc!.beads.map((b: any) => b.moment)).toEqual(["hook", "best", "cta"]);
    expect(view.doc!.beads[0].words[0].struck).toBe(true);

    const history = await t.query(api.edits.history, { anonId: ANON, projectId });
    expect(history.map((h) => h.reason)).toContain("trimmed filler · 'um'");

    // user restores the filler: pinned, and autopilots won't re-strike it
    const r = await t.mutation(api.edits.apply, {
      anonId: ANON, projectId, baseVersion: view.doc!.version, reason: "restored · 'um'",
      ops: [{ op: "set", path: `/beads/@${view.doc!.beads[0].id}/words/@${view.doc!.beads[0].words[0].id}/struck`, value: false }],
    });
    expect(r.ok).toBe(true);
    // a stale write is rejected, not merged blindly
    expect((await t.mutation(api.edits.apply, { anonId: ANON, projectId, baseVersion: 0, reason: "x", ops: [{ op: "set", path: "/aspect", value: "1:1" }] })).ok).toBe(false);

    await work(t, workerId, "reframe", () => ({ keyframes: [{ ms: 0, cx: 0.4, cy: 0.45, scale: 1 }], faces: 12 }));
    view = (await t.query(api.projects.get, { projectId, anonId: ANON }))!;
    expect(Object.values(view.doc!.reframe)[0]).toHaveLength(1);

    const jobId = await t.mutation(api.pipeline.startExport, { anonId: ANON, projectId, aspect: "9:16", maxDurationMs: 15_000, requestId: "e1" });
    const renderJob = await t.mutation(internal.jobs.claim, { workerId, types: ["render"] });
    expect(renderJob!.id).toBe(jobId);
    expect((renderJob!.input as any).watermark).toBe(true); // free / anonymous: watermark, enforced server-side
    expect((renderJob!.input as any).doc.beads[0].words[0].struck).toBe(false); // the user's restore is in the render
  });

  it("marks the project failed, honestly, when transcription fails for good", async () => {
    const t = convexTest(schema, modules);
    const { token } = await t.mutation(internal.workers.register, { name: "w", provider: "x" });
    const workerId = (await t.mutation(internal.workers.touch, { tokenHash: await sha(token) }))!;
    const projectId = await t.mutation(api.projects.create, { anonId: ANON });
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["x"])));
    await t.mutation(api.projects.addSource, { anonId: ANON, projectId, storageId, contentType: "video/mp4", w: 1, h: 1, durationMs: 1, source: "upload" });
    const job = await t.mutation(internal.jobs.claim, { workerId, types: ["transcribe"] });
    await t.mutation(internal.jobs.fail, { workerId, jobId: job!.id, error: "no audio stream", retryable: false });
    await t.finishAllScheduledFunctions(() => {});
    const view = (await t.query(api.projects.get, { projectId, anonId: ANON }))!;
    expect(view.project.stage).toBe("failed");
    expect(view.project.stageDetail).toContain("no audio stream");
  });

  it("other sessions can't see or edit the project", async () => {
    const t = convexTest(schema, modules);
    const projectId = await t.mutation(api.projects.create, { anonId: ANON });
    const other = "anon_" + "d".repeat(32);
    expect(await t.query(api.projects.get, { projectId, anonId: other })).toBeNull();
    await expect(t.mutation(api.edits.apply, { anonId: other, projectId, baseVersion: 0, reason: "x", ops: [{ op: "set", path: "/aspect", value: "1:1" }] })).rejects.toThrow();
  });
});
