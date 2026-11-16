import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { JOB_SPECS, JOB_TYPES, parseJobInput, parseJobOutput } from "../src/jobs";
import { evaluateFlag, heroVariant, HERO_LINES, AnalyticsEvent } from "../src";

describe("job contract", () => {
  it("covers every job type the brief names", () => {
    for (const t of ["transcribe", "autocut", "reframe", "still", "i2v", "t2v", "voice", "matte", "inpaint", "grade", "render"])
      expect(JOB_TYPES).toContain(t);
  });
  it("applies defaults and rejects bad input", () => {
    expect(parseJobInput("hello", { message: "hi" }).steps).toBe(5);
    expect(() => parseJobInput("voice", { text: "x", voiceId: "v" })).toThrow(); // consent required
    expect(() => parseJobOutput("hello", { echo: 1 })).toThrow();
  });
  it("committed JSON Schema matches the zod contract (run pnpm schema:emit)", () => {
    const schema = JSON.parse(readFileSync(new URL("../schema/jobs.schema.json", import.meta.url), "utf8"));
    expect(Object.keys(schema.jobs).sort()).toEqual([...JOB_TYPES].sort());
    for (const t of JOB_TYPES) expect(schema.jobs[t].version).toBe(JOB_SPECS[t].version);
  });
});

describe("flags", () => {
  it("is stable and respects rollout", () => {
    const row = { key: "weave", enabled: true, rolloutPct: 50, allow: [] };
    expect(evaluateFlag(row, "u1")).toBe(evaluateFlag(row, "u1"));
    expect(evaluateFlag({ ...row, rolloutPct: 0 }, "u1")).toBe(false);
    expect(evaluateFlag({ ...row, rolloutPct: 0, allow: ["u1"] }, "u1")).toBe(true);
    expect(evaluateFlag({ ...row, enabled: false, allow: ["u1"] }, "u1")).toBe(false);
    expect(HERO_LINES.a).toBe("Making real people look great.");
    expect(["a", "b"]).toContain(heroVariant("anon"));
  });
});

describe("analytics", () => {
  it("validates event props", () => {
    expect(() => AnalyticsEvent.parse({ name: "first_preview", props: { platform: "web", msSinceDrop: 41000 } })).not.toThrow();
    expect(() => AnalyticsEvent.parse({ name: "first_preview", props: { platform: "tv" } })).toThrow();
  });
});
