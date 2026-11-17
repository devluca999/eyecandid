import { describe, expect, it } from "vitest";
import { decideExport, periodKey, PLANS } from "../src";

const base = { mode: "best" as const, fullMs: 30_000, minutesUsed: 0 };

describe("decideExport", () => {
  it("free: watermarked, capped, ok under the cap", () => {
    const d = decideExport({ ...base, plan: "free" });
    expect(d).toMatchObject({ ok: true, watermark: true, capMs: 60_000, effectiveMs: 30_000 });
  });
  it("free + full length over the cap needs a paid plan, but the free export stays available", () => {
    const d = decideExport({ ...base, plan: "free", fullMs: 120_000 });
    expect(d).toEqual({ ok: false, reason: "length_cap", freeAvailable: true });
  });
  it("free with an explicit cutdown under the cap is fine", () => {
    expect(decideExport({ ...base, plan: "free", fullMs: 120_000, requestedMs: 30_000 })).toMatchObject({ ok: true, watermark: true, effectiveMs: 30_000 });
  });
  it("free mode clamps to the free cap even for a paid plan, and keeps the watermark", () => {
    expect(decideExport({ ...base, plan: "studio", mode: "free", fullMs: 300_000 })).toMatchObject({ ok: true, plan: "free", watermark: true, effectiveMs: 60_000 });
  });
  it("paid: no watermark, plan cap", () => {
    expect(decideExport({ ...base, plan: "creator", fullMs: 120_000 })).toMatchObject({ ok: true, watermark: false, effectiveMs: 120_000 });
    expect(decideExport({ ...base, plan: "creator", fullMs: 10 * 60_000 })).toMatchObject({ ok: false, reason: "length_cap" });
  });
  it("minutes exhausted blocks the free export too", () => {
    const d = decideExport({ ...base, plan: "free", minutesUsed: PLANS.free.monthlyMinutes });
    expect(d).toEqual({ ok: false, reason: "minutes", freeAvailable: false });
  });
  it("a paid plan out of minutes may fall back to free if free minutes remain", () => {
    const d = decideExport({ ...base, plan: "creator", minutesUsed: PLANS.creator.monthlyMinutes });
    expect(d).toMatchObject({ ok: false, reason: "minutes" });
  });
  it("period keys are UTC months", () => {
    expect(periodKey(Date.UTC(2026, 10, 30, 23, 59))).toBe("2026-11");
    expect(periodKey(Date.UTC(2026, 11, 1))).toBe("2026-12");
  });
});
