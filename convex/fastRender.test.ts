import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { emptyEditDoc, JOB_SPECS } from "@eyelore/core";
import schema from "./schema";
import { api } from "./_generated/api";

/** ADR 0017: a free worker export renders with plain ffmpeg from a plan; anything with generated stills stays on Remotion. */

const modules = import.meta.glob("./**/*.ts");
const ANON = "anon_" + "f".repeat(32);

async function exportWith(broll: boolean) {
  const t = convexTest(schema, modules);
  const projectId = await t.mutation(api.projects.create, { anonId: ANON });
  await t.run(async (ctx) => {
    const row = await ctx.db.query("editDocs").withIndex("by_project", (q) => q.eq("projectId", projectId)).unique();
    const doc = emptyEditDoc(projectId);
    doc.clips = [{ id: "c1", mediaId: "m1", source: "upload", w: 1080, h: 1920, durationMs: 20_000, fps: 30 }];
    doc.beads = [{ id: "b1", clipId: "c1", inMs: 0, outMs: 20_000, words: [], cuts: [], struck: false }] as typeof doc.beads;
    if (broll) doc.tracks.broll = [{ id: "s1", ref: "still1", startMs: 0, durationMs: 0, params: { beadId: "b1" } }];
    await ctx.db.patch(row!._id, { doc });
    await ctx.db.patch(projectId, { stage: "ready" });
  });
  await t.mutation(api.pipeline.startExport, { anonId: ANON, projectId, aspect: "9:16", requestId: "r1" });
  const job = (await t.run((ctx) => ctx.db.query("jobs").collect())).find((j) => j.type === "render")!;
  return JOB_SPECS.render.input.parse(job.input);
}

describe("fast free render", () => {
  it("a free export carries engine fast and its plan", async () => {
    const input = await exportWith(false);
    expect(input.engine).toBe("fast");
    expect(input.fast?.frames).toBe(600);
    expect(input.fast?.shots.reduce((a, s) => a + s.frames, 0)).toBe(600);
    expect(input.watermark).toBe(true);
    expect(input.sound?.length).toBe(1);
  });

  it("an edit with a generated still renders with Remotion", async () => {
    const input = await exportWith(true);
    expect(input.engine).toBeUndefined();
    expect(input.fast).toBeUndefined();
  });
});
