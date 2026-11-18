import { describe, expect, it } from "vitest";
import { ANON_FREE_EXPORTS, decideExportCount, FREE_EXPORTS_PER_MONTH, nextMonthLabel } from "../src";

const base = { period: "2026-11", signInAvailable: true };

describe("free export count (mvp-spec access model)", () => {
  it("anonymous: one export, then sign-in when it is switched on", () => {
    expect(ANON_FREE_EXPORTS).toBe(1);
    expect(decideExportCount({ ...base, signedIn: false, plan: "free", used: 0 })).toEqual({ ok: true, count: true });
    const r = decideExportCount({ ...base, signedIn: false, plan: "free", used: 1 });
    expect(r).toMatchObject({ ok: false, code: "sign_in_required" });
  });

  it("anonymous without sign-in switched on: the export still goes, counted", () => {
    expect(decideExportCount({ ...base, signInAvailable: false, signedIn: false, plan: "free", used: 5 })).toEqual({ ok: true, count: true });
  });

  it("an anon id never gets a paid plan's unlimited exports", () => {
    expect(decideExportCount({ ...base, signedIn: false, plan: "creator", used: 1 })).toMatchObject({ ok: false });
  });

  it("signed in on Free: 3 a month, with when they come back", () => {
    expect(FREE_EXPORTS_PER_MONTH).toBe(3);
    for (const used of [0, 1, 2]) expect(decideExportCount({ ...base, signedIn: true, plan: "free", used })).toEqual({ ok: true, count: true });
    const r = decideExportCount({ ...base, signedIn: true, plan: "free", used: 3 });
    expect(r).toEqual({ ok: false, code: "exports_used", message: "this month's 3 free exports are used · more on dec 1" });
  });

  it("a paid plan is unlimited and not counted", () => {
    expect(decideExportCount({ ...base, signedIn: true, plan: "creator", used: 999 })).toEqual({ ok: true, count: false });
  });

  it("names the next month, across a year end", () => {
    expect(nextMonthLabel("2026-12")).toBe("jan 1");
    expect(nextMonthLabel("2026-01")).toBe("feb 1");
  });
});
