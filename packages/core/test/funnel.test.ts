import { describe, expect, it } from "vitest";
import { aggregateFunnel, percentile, type FunnelEventRow } from "../src/funnel";

const row = (anon: string | undefined, props: Record<string, unknown> = {}, userId?: string): FunnelEventRow => ({
  anonHash: anon,
  userId,
  props,
});

describe("percentile", () => {
  it("handles empty, single and interpolated cases", () => {
    expect(percentile([], 0.5)).toBeNull();
    expect(percentile([5], 0.9)).toBe(5);
    expect(percentile([10, 20, 30, 40], 0.5)).toBe(25);
    expect(percentile([1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 0.9)).toBeCloseTo(9.1);
  });
});

describe("aggregateFunnel", () => {
  it("counts events and distinct sessions per step in FUNNEL order", () => {
    const s = aggregateFunnel({
      rows: {
        landing_view: [row("a"), row("a"), row("b"), row("c"), row("d")],
        drop_started: [row("a"), row("b")],
        upload_done: [row("a")],
      },
    });
    expect(s.steps.map((x) => x.name).slice(0, 4)).toEqual(["landing_view", "drop_started", "upload_done", "first_preview"]);
    expect(s.steps[0]).toMatchObject({ events: 5, sessions: 4, fromPrev: null, fromLanding: 1 });
    expect(s.steps[1]).toMatchObject({ events: 2, sessions: 2, fromPrev: 0.5, fromLanding: 0.5 });
    expect(s.steps[2]).toMatchObject({ sessions: 1, fromPrev: 0.5, fromLanding: 0.25 });
    expect(s.steps[3]).toMatchObject({ events: 0, sessions: 0, fromPrev: 0, fromLanding: 0 });
    expect(s.steps[4]!.fromPrev).toBeNull(); // previous step empty: no divide by zero
  });

  it("falls back to userId and ignores rows with no identity for sessions", () => {
    const s = aggregateFunnel({ rows: { landing_view: [row(undefined, {}, "u1"), row(undefined, {}, "u1"), row(undefined), row("x", {}, "u1")] } });
    expect(s.steps[0]).toMatchObject({ events: 4, sessions: 2 });
  });

  it("returns null ratios when landing is empty", () => {
    const s = aggregateFunnel({ rows: { drop_started: [row("a")] } });
    expect(s.steps[1]).toMatchObject({ sessions: 1, fromPrev: null, fromLanding: null });
  });

  it("passes the truncated flag per step", () => {
    const s = aggregateFunnel({ rows: {}, truncated: { upload_done: true } });
    expect(s.steps.filter((x) => x.truncated).map((x) => x.name)).toEqual(["upload_done"]);
  });

  it("splits landing to export_done by platform and variant", () => {
    const s = aggregateFunnel({
      rows: {
        landing_view: [
          row("a", { platform: "web", variant: "A" }),
          row("b", { platform: "web", variant: "B" }),
          row("c", { platform: "ios", variant: "A" }),
          row("d", { platform: "web" }),
          row("e", {}),
        ],
        export_done: [row("a", { platform: "web", variant: "A" }), row("c", { platform: "ios", variant: "A" })],
      },
    });
    expect(s.byPlatform).toEqual([
      { key: "web", landing: 3, exported: 1, conversion: 1 / 3 },
      { key: "ios", landing: 1, exported: 1, conversion: 1 },
      { key: "unknown", landing: 1, exported: 0, conversion: 0 },
    ]);
    expect(s.byVariant).toEqual([
      { key: "A", landing: 2, exported: 2, conversion: 1 },
      { key: "B", landing: 1, exported: 0, conversion: 0 },
      { key: "none", landing: 2, exported: 0, conversion: 0 },
    ]);
  });

  it("computes time-to-wow median and p90, skipping bad values", () => {
    const vals = [10_000, 20_000, 30_000, 40_000, 50_000, 60_000, 70_000, 80_000, 90_000, 100_000];
    const s = aggregateFunnel({
      rows: { first_preview: [...vals.map((v) => row("a", { msSinceDrop: v })), row("z", { msSinceDrop: "x" }), row("y", { msSinceDrop: -1 }), row("w")] },
    });
    expect(s.timeToWow.samples).toBe(10);
    expect(s.timeToWow.medianMs).toBe(55_000);
    expect(s.timeToWow.p90Ms).toBeCloseTo(91_000);
    expect(aggregateFunnel({ rows: {} }).timeToWow).toEqual({ samples: 0, medianMs: null, p90Ms: null });
  });
});
