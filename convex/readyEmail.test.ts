import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
const ANON = "anon_" + "a1".repeat(16);
async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}
const words = [
  { text: "Um,", startMs: 0, endMs: 300, conf: 0.9 }, { text: "this", startMs: 400, endMs: 600, conf: 0.9 },
  { text: "works.", startMs: 650, endMs: 1000, conf: 0.9 },
];

describe("leave your email (MVP spec, Phase 2)", () => {
  it("queues one ready email for an anonymous server edit when nobody is watching", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.flags.set, { key: "ready_email", enabled: true });
    const { token } = await t.mutation(internal.workers.register, { name: "w", provider: "cpu-stub" });
    const workerId = (await t.mutation(internal.workers.touch, { tokenHash: await sha(token) }))! as Id<"workers">;
    const projectId = await t.mutation(api.projects.create, { anonId: ANON });
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["v"], { type: "video/mp4" })));
    await t.mutation(api.projects.addSource, { anonId: ANON, projectId, storageId, contentType: "video/mp4", w: 1080, h: 1920, durationMs: 1500, source: "upload" });
    await expect(t.mutation(api.projects.setReadyEmail, { anonId: ANON, projectId, email: "not an email" })).rejects.toThrow();
    expect((await t.mutation(api.projects.setReadyEmail, { anonId: ANON, projectId, email: " Me@Example.com " })).ok).toBe(true);

    const tj = await t.mutation(internal.jobs.claim, { workerId, types: ["transcribe"] });
    await t.mutation(internal.jobs.complete, { workerId, jobId: tj!.id, output: { language: "en", words, durationMs: 1500 } });
    await t.finishAllScheduledFunctions(() => {});
    const aj = await t.mutation(internal.jobs.claim, { workerId, types: ["autocut"] });
    await t.mutation(internal.jobs.complete, { workerId, jobId: aj!.id, output: { strikes: [], beads: [{ inMs: 0, outMs: 1000, moment: "hook" }] } });
    await t.finishAllScheduledFunctions(() => {});

    const notes = await t.run((ctx) => ctx.db.query("notifications").collect());
    expect(notes).toHaveLength(1);
    expect(notes[0]).toMatchObject({ kind: "edit_ready", email: "me@example.com", status: "not_sent" }); // SendPulse not configured here
  });

  it("refuses on an on-device edit (it needs the tab open)", async () => {
    const t = convexTest(schema, modules);
    const projectId = await t.mutation(api.projects.create, { anonId: ANON });
    await t.mutation(api.projects.addDeviceSource, { anonId: ANON, projectId, contentType: "video/mp4", w: 1, h: 1, durationMs: 1000, bytes: 1 });
    await expect(t.mutation(api.projects.setReadyEmail, { anonId: ANON, projectId, email: "me@example.com" })).rejects.toThrow(/keep the tab open/);
  });
});
