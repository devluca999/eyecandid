import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const ANON = "anon_" + "e".repeat(32);
const OTHER = "anon_" + "f".repeat(32);
const words = [
  { text: "Um,", startMs: 0, endMs: 300, conf: 0.9 }, { text: "this", startMs: 400, endMs: 600, conf: 0.9 },
  { text: "ring", startMs: 650, endMs: 900, conf: 0.9 }, { text: "tracks", startMs: 950, endMs: 1200, conf: 0.9 },
  { text: "sleep.", startMs: 1250, endMs: 1700, conf: 0.9 }, { text: "It", startMs: 3300, endMs: 3400, conf: 0.9 },
  { text: "it", startMs: 3450, endMs: 3550, conf: 0.9 }, { text: "lasts", startMs: 3600, endMs: 3900, conf: 0.9 },
  { text: "a", startMs: 3950, endMs: 4000, conf: 0.9 }, { text: "week.", startMs: 4050, endMs: 4400, conf: 0.9 },
  { text: "Link", startMs: 4700, endMs: 5000, conf: 0.9 }, { text: "below.", startMs: 5050, endMs: 5500, conf: 0.9 },
];

async function deviceProject(t: ReturnType<typeof convexTest>) {
  const projectId = await t.mutation(api.projects.create, { anonId: ANON });
  const { clipId } = await t.mutation(api.projects.addDeviceSource, { anonId: ANON, projectId, contentType: "video/mp4", w: 1080, h: 1920, durationMs: 6000, bytes: 5_000_000 });
  return { projectId, clipId };
}

describe("on-device engine (ADR 0012)", () => {
  it("device transcript → the same server-side autocut, beads and moments, no upload, no job", async () => {
    const t = convexTest(schema, modules);
    const { projectId, clipId } = await deviceProject(t);
    let view = (await t.query(api.projects.get, { projectId, anonId: ANON }))!;
    expect(view.project.engine).toBe("device");
    expect(view.project.stageDetail).toBe("on this device");
    expect(view.media[0]!.url).toBeNull(); // the bytes never left the device
    await t.mutation(api.projects.deviceProgress, { anonId: ANON, projectId, detail: "listening · on this device" });

    await t.mutation(api.projects.applyDeviceTranscript, { anonId: ANON, projectId, clipId, transcript: { language: "en", words, durationMs: 6000 } });
    view = (await t.query(api.projects.get, { projectId, anonId: ANON }))!;
    expect(view.project.stage).toBe("ready");
    expect(view.jobs).toHaveLength(0);
    const doc = view.doc!;
    expect(doc.beads).toHaveLength(3);
    expect(doc.beads[0]!.words[0]).toMatchObject({ text: "Um,", struck: true });
    expect(doc.beads[1]!.words[1]).toMatchObject({ text: "it", struck: true, strikeKind: "repeat" });
    const history = await t.query(api.edits.history, { anonId: ANON, projectId });
    expect(history.map((h) => h.reason)).toContain("trimmed filler · 'um'");

    // idempotent: a second report from the device (retry, second tab) changes nothing
    const again = await t.mutation(api.projects.applyDeviceTranscript, { anonId: ANON, projectId, clipId, transcript: { language: "en", words, durationMs: 6000 } });
    expect(again.already).toBe(true);
  });

  it("rejects a malformed transcript and another session's report", async () => {
    const t = convexTest(schema, modules);
    const { projectId, clipId } = await deviceProject(t);
    await expect(t.mutation(api.projects.applyDeviceTranscript, { anonId: ANON, projectId, clipId, transcript: { words: [{ text: 1 }] } })).rejects.toThrow();
    await expect(t.mutation(api.projects.applyDeviceTranscript, { anonId: OTHER, projectId, clipId, transcript: { language: "en", words, durationMs: 6000 } })).rejects.toThrow();
    await expect(t.mutation(api.projects.applyDeviceTranscript, { anonId: ANON, projectId, clipId: "c_nope", transcript: { language: "en", words, durationMs: 6000 } })).rejects.toThrow(/unknown clip/);
  });

  it("records an honest failure, and a device edit deletes cleanly (nothing stored server-side)", async () => {
    const t = convexTest(schema, modules);
    const { projectId } = await deviceProject(t);
    await t.mutation(api.projects.deviceFailed, { anonId: ANON, projectId, reason: "no speech found in this clip" });
    const view = (await t.query(api.projects.get, { projectId, anonId: ANON }))!;
    expect(view.project.stage).toBe("failed");
    expect(view.project.stageDetail).toBe("no speech found in this clip");
    await t.mutation(api.projects.remove, { projectId, anonId: ANON });
    expect(await t.query(api.projects.get, { projectId, anonId: ANON })).toBeNull();
    expect(await t.run((ctx) => ctx.db.query("media").collect())).toHaveLength(0);
  });
});

describe("on-device export (ADR 0012)", () => {
  it("is authorized by the same server-side plan, recorded and counted, with no render job", async () => {
    const t = convexTest(schema, modules);
    const { projectId, clipId } = await deviceProject(t);
    await t.mutation(api.projects.applyDeviceTranscript, { anonId: ANON, projectId, clipId, transcript: { language: "en", words, durationMs: 6000 } });
    const r = await t.mutation(api.pipeline.authorizeDeviceExport, { anonId: ANON, projectId, aspect: "9:16", requestId: "x" });
    expect(r.watermark).toBe(true); // anonymous free export
    expect(r.doc.aspect).toBe("9:16");
    expect(r.doc.beads[0]!.words[0]!.struck).toBe(true);
    const view = (await t.query(api.projects.get, { projectId, anonId: ANON }))!;
    expect(view.jobs).toHaveLength(0);
    expect(view.exports[0]).toMatchObject({ status: "succeeded", device: true, url: null });
    const usage = await t.run((ctx) => ctx.db.query("anonUsage").collect());
    expect(usage[0]!.minutesUsed).toBeGreaterThan(0);
  });
  it("refuses for a server-engine edit", async () => {
    const t = convexTest(schema, modules);
    const projectId = await t.mutation(api.projects.create, { anonId: ANON });
    await expect(t.mutation(api.pipeline.authorizeDeviceExport, { anonId: ANON, projectId, aspect: "9:16", requestId: "x" })).rejects.toThrow();
  });
});

describe("on-device clips keep the free length cap", () => {
  it("refuses a free clip over 60 s with the one-line reason", async () => {
    const t = convexTest(schema, modules);
    const projectId = await t.mutation(api.projects.create, { anonId: ANON });
    await expect(
      t.mutation(api.projects.addDeviceSource, { anonId: ANON, projectId, contentType: "video/mp4", w: 1080, h: 1920, durationMs: 61_000, bytes: 1 }),
    ).rejects.toThrow(/60 s/);
  });
});

describe("on-device reframe (ADR 0012)", () => {
  const kfs = [{ ms: 0, cx: 0.4, cy: 0.3, scale: 1 }, { ms: 500, cx: 0.45, cy: 0.32, scale: 1 }];
  async function ready(t: ReturnType<typeof convexTest>) {
    const { projectId, clipId } = await deviceProject(t);
    await t.mutation(api.projects.applyDeviceTranscript, { anonId: ANON, projectId, clipId, transcript: { language: "en", words, durationMs: 6000 } });
    return { projectId, clipId };
  }
  it("commits the face track with the same history line as the server path", async () => {
    const t = convexTest(schema, modules);
    const { projectId, clipId } = await ready(t);
    await t.mutation(api.projects.applyDeviceReframe, { anonId: ANON, projectId, clipId, keyframes: kfs, faces: 9 });
    const view = (await t.query(api.projects.get, { projectId, anonId: ANON }))!;
    expect(view.doc!.reframe[clipId]).toEqual(kfs);
    const history = await t.query(api.edits.history, { anonId: ANON, projectId });
    expect(history.map((h) => h.reason)).toContain("reframed · keeps your face centred");
  });
  it("rejects invalid or oversized keyframes and an unknown clip", async () => {
    const t = convexTest(schema, modules);
    const { projectId, clipId } = await ready(t);
    const go = (keyframes: unknown, id = clipId) => t.mutation(api.projects.applyDeviceReframe, { anonId: ANON, projectId, clipId: id, keyframes, faces: 1 });
    await expect(go([{ ms: 0, cx: 2, cy: 0.5, scale: 1 }])).rejects.toThrow();
    await expect(go("nope")).rejects.toThrow();
    await expect(go([])).rejects.toThrow(/bad keyframes/);
    await expect(go(Array.from({ length: 2001 }, (_, i) => ({ ms: i, cx: 0.5, cy: 0.5, scale: 1 })))).rejects.toThrow(/bad keyframes/);
    await expect(go(kfs, "c_nope")).rejects.toThrow(/unknown clip/);
  });
  it("is owner-only and refused for a server project", async () => {
    const t = convexTest(schema, modules);
    const { projectId, clipId } = await ready(t);
    await expect(t.mutation(api.projects.applyDeviceReframe, { anonId: OTHER, projectId, clipId, keyframes: kfs, faces: 1 })).rejects.toThrow();
    const server = await t.mutation(api.projects.create, { anonId: ANON });
    await expect(t.mutation(api.projects.applyDeviceReframe, { anonId: ANON, projectId: server, clipId, keyframes: kfs, faces: 1 })).rejects.toThrow(/not an on-device/);
  });
});
