import { describe, expect, it } from "vitest";
import { costSummary, parseRate } from "../src/cost";

describe("cost per free edit", () => {
  it("prices worker seconds and splits device exports out", () => {
    const s = costSummary({
      jobs: [{ startedAt: 0, finishedAt: 1800_000 }, { startedAt: 10, finishedAt: 1800_010 }, { startedAt: 5 }],
      exports: [{ device: false }, { device: true }, { device: true }, { device: false }],
      usdPerHour: 0.2,
    });
    expect(s.workerSeconds).toBe(3600);
    expect(s).toMatchObject({ serverExports: 2, deviceExports: 2 });
    expect(s.workerUsd).toBeCloseTo(0.2);
    expect(s.usdPerServerExport).toBeCloseTo(0.1);
    expect(s.usdPerExport).toBeCloseTo(0.05);
  });
  it("says nothing it can't know: no rate, no exports", () => {
    expect(costSummary({ jobs: [], exports: [], usdPerHour: null })).toMatchObject({ workerUsd: null, usdPerServerExport: null, usdPerExport: null });
    expect(costSummary({ jobs: [], exports: [{ device: true }], usdPerHour: 1 }).usdPerServerExport).toBeNull();
  });
  it("reads the rate strictly", () => {
    expect(parseRate("0.21")).toBe(0.21);
    for (const bad of [undefined, "", "0", "-1", "abc"]) expect(parseRate(bad)).toBeNull();
  });
});
