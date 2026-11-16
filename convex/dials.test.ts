import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import { toTimeline, type EditDoc } from "@eyelore/core";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";

const modules = import.meta.glob("./**/*.ts");
const ANON = "anon_" + "e".repeat(32);

async function sha(s: string) {
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

// pauses: 300ms (fast cuts it), 700ms (autocut cut it; slow restores it), 1.5s (cut at every pace)
const words = [
  { text: "This", startMs: 0, endMs: 200, conf: 0.9 }, { text: "ring", startMs: 500, endMs: 800, conf: 0.9 }, { text: "tracks", startMs: 850, endMs: 1100, conf: 0.9 },
  { text: "sleep.", startMs: 1150, endMs: 1500, conf: 0.9 },
  { text: "It", startMs: 2200, endMs: 2300, conf: 0.95 }, { text: "lasts", startMs: 2350, endMs: 2600, conf: 0.95 }, { text: "a", startMs: 2650, endMs: 2700, conf: 0.95 },
  { text: "week.", startMs: 2750, endMs: 3100, conf: 0.95 }, { text: "Link", startMs: 4600, endMs: 4900, conf: 0.9 }, { text: "below.", startMs: 4950, endMs: 5400, conf: 0.9 },
];

/** A project that went through transcribe + autocut, as the real worker shapes it. */
async function readyProject() {
  const t = convexTest(schema, modules);
  const { token } = await t.mutation(internal.workers.register, { name: "w", provider: "cpu-stub" });
  const workerId = (await t.mutation(internal.workers.touch, { tokenHash: await sha(token) }))! as Id<"workers">;
  const projectId = await t.mutation(api.projects.create, { anonId: ANON });
  const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["fake video"], { type: "video/mp4" })));
  await t.mutation(api.projects.addSource, { anonId: ANON, projectId, storageId, contentType: "video/mp4", w: 640, h: 360, durationMs: 5500, source: "upload" });
  for (const [type, output] of [
    ["transcribe", { language: "en", words, durationMs: 5500 }],
    ["autocut", {
      strikes: [
        { startMs: 1620, endMs: 2080, kind: "silence", reason: "trimmed pause · 0.7s" },
        { startMs: 3220, endMs: 4480, kind: "silence", reason: "trimmed pause · 1.5s" },
      ],
      beads: [{ inMs: 0, outMs: 1500, moment: "hook" }, { inMs: 2200, outMs: 3100 }, { inMs: 4600, outMs: 5400, moment: "cta" }],
    }],
  ] as const) {
    const job = await t.mutation(internal.jobs.claim, { workerId, types: [type] });
    await t.mutation(internal.jobs.complete, { workerId, jobId: job!.id, output });
    await t.finishAllScheduledFunctions(() => {});
  }
  const doc = async () => (await t.query(api.projects.get, { projectId, anonId: ANON }))!.doc as EditDoc;
  expect((await t.query(api.projects.get, { projectId, anonId: ANON }))!.project.stage).toBe("ready");
  return { t, projectId, doc };
}

const D = { pace: 0.5, brollDensity: 0.3, energy: 0.5 };

describe("edits.setDials", () => {
  it("slow pace restores the 0.7s pause with a reason; turning it back cuts it again", async () => {
    const { t, projectId, doc } = await readyProject();
    const before = await doc();
    const d0 = toTimeline(before).durationMs;
    const r = await t.mutation(api.edits.setDials, { anonId: ANON, projectId, baseVersion: before.version, dials: { ...D, pace: 0 } });
    expect(r.ok).toBe(true);
    const slow = await doc();
    expect(slow.style.dials.pace).toBe(0);
    expect(toTimeline(slow).durationMs).toBe(d0 + 460);
    const history = await t.query(api.edits.history, { anonId: ANON, projectId });
    expect(history[0]).toMatchObject({ actor: "autopilot:dials", reason: "pause kept · 0.7s · pace" });
    expect(history[1]).toMatchObject({ actor: "user", reason: "dial · pace 0%" });

    await t.mutation(api.edits.setDials, { anonId: ANON, projectId, baseVersion: slow.version, dials: D });
    const back = await doc();
    expect(toTimeline(back).durationMs).toBe(d0);
    expect({ ...back.beads, }).toEqual({ ...before.beads });
  });

  it("fast pace cuts a 0.3s pause autocut left alone; energy punches in; both visible to the render", async () => {
    const { t, projectId, doc } = await readyProject();
    const before = await doc();
    await t.mutation(api.edits.setDials, { anonId: ANON, projectId, baseVersion: before.version, dials: { pace: 1, brollDensity: 0.3, energy: 0.8 } });
    const after = await doc();
    expect(toTimeline(after).durationMs).toBe(toTimeline(before).durationMs - (300 - 160));
    expect(after.effects.map((e) => e.anchor)).toEqual([{ moment: "hook" }, { moment: "best" }, { moment: "cta" }]);
    const reasons = (await t.query(api.edits.history, { anonId: ANON, projectId })).map((h) => h.reason);
    expect(reasons).toContain("pause cut · 0.3s · pace");
    expect(reasons).toContain("punch-in · your hook");
  });

  it("b-roll density is stored and decides nothing", async () => {
    const { t, projectId, doc } = await readyProject();
    const before = await doc();
    await t.mutation(api.edits.setDials, { anonId: ANON, projectId, baseVersion: before.version, dials: { ...D, brollDensity: 0.9 } });
    const after = await doc();
    expect(after.style.dials.brollDensity).toBe(0.9);
    expect(after.beads).toEqual(before.beads);
    expect(after.effects).toEqual([]);
    expect(after.version).toBe(before.version + 1);
  });

  it("rejects a stale base version and never re-decides a pause you restored", async () => {
    const { t, projectId, doc } = await readyProject();
    const before = await doc();
    expect((await t.mutation(api.edits.setDials, { anonId: ANON, projectId, baseVersion: before.version - 1, dials: { ...D, pace: 0 } })).ok).toBe(false);
    // you keep the 1.5s pause by hand; even the fastest pace leaves it
    const bead = before.beads.find((b) => b.cuts.some((c) => c.startMs === 3220))!;
    const cut = bead.cuts.find((c) => c.startMs === 3220)!;
    await t.mutation(api.edits.apply, { anonId: ANON, projectId, baseVersion: before.version, reason: "kept pause · 1.3s", ops: [{ op: "set", path: `/beads/@${bead.id}/cuts/@${cut.id}/struck`, value: false }] });
    await t.mutation(api.edits.setDials, { anonId: ANON, projectId, baseVersion: before.version + 1, dials: { ...D, pace: 1 } });
    const after = await doc();
    expect(after.beads.flatMap((b) => b.cuts).find((c) => c.id === cut.id)!.struck).toBe(false);
  });

  it("⌘Z after a dial move puts the dial back and the cut follows it", async () => {
    const { t, projectId, doc } = await readyProject();
    const before = await doc();
    await t.mutation(api.edits.setDials, { anonId: ANON, projectId, baseVersion: before.version, dials: { ...D, pace: 0, energy: 1 } });
    expect((await doc()).effects.length).toBeGreaterThan(0);
    await t.mutation(api.edits.undo, { anonId: ANON, projectId, baseVersion: (await doc()).version });
    const after = await doc();
    expect(after.style.dials).toEqual(before.style.dials);
    expect(after.beads).toEqual(before.beads);
    expect(after.effects).toEqual([]);
  });

  it("other sessions can't turn your dials", async () => {
    const { t, projectId, doc } = await readyProject();
    await expect(t.mutation(api.edits.setDials, { anonId: "anon_" + "f".repeat(32), projectId, baseVersion: (await doc()).version, dials: D })).rejects.toThrow();
  });
});
