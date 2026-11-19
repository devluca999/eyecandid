import { describe, expect, it } from "vitest";
import {
  balance, creditCost, estimateSpeechSeconds, monthEnd, monthlyLot, PLAN_CATALOG, release, reserve, settle, TOPUP_CREDITS, topupLot,
  worstCaseGenerationUsd, COST_PER_CREDIT_USD, type CreditLot,
} from "../src/credits";

const NOV = Date.UTC(2026, 10, 17);
const DAY = 86_400_000;

describe("creditCost: one credit is one generated second", () => {
  it("charges generated video by the second, rounded up", () => {
    expect(creditCost("i2v", { seconds: 5 })).toBe(5);
    expect(creditCost("t2v", { seconds: 4.2 })).toBe(5);
    expect(creditCost("i2v", { seconds: 0.4 })).toBe(1);
  });
  it("charges a lip-synced talking head double", () => {
    expect(creditCost("lipsync", { seconds: 8 })).toBe(16);
  });
  it("charges background replace, inpainting and voice like plain generation", () => {
    for (const t of ["matte", "inpaint", "voice"]) expect(creditCost(t, { seconds: 10 })).toBe(10);
  });
  it("a still is one credit; a look is editing and free", () => {
    expect(creditCost("still")).toBe(1);
    expect(creditCost("grade")).toBe(0);
  });
  it("refuses a per-second job with no length instead of guessing", () => {
    expect(() => creditCost("i2v")).toThrow(/length/);
    expect(() => creditCost("i2v", { seconds: 0 })).toThrow();
    expect(() => creditCost("i2v", { seconds: NaN })).toThrow();
  });
  it("charges unknown GPU work like plain generation", () => {
    expect(creditCost("something_new", { seconds: 3 })).toBe(3);
    expect(() => creditCost("something_new")).toThrow();
  });
  it("estimates speech length for reserving a voice job", () => {
    expect(estimateSpeechSeconds("one two three four five")).toBe(2);
    expect(estimateSpeechSeconds("")).toBe(1);
    // no spaces: counted by characters, so it cannot reserve far less than it will say
    expect(estimateSpeechSeconds(Array.from({ length: 150 }, (_, i) => `word${i}`).join(","))).toBeGreaterThanOrEqual(60);
  });
});

describe("the balance", () => {
  const lots = (): CreditLot[] => [
    { id: "gift", kind: "grant", remaining: 10 },
    topupLot("t1", 120, NOV - 300 * DAY), // expires in 65 days
    monthlyLot("2026-11", 100), // expires 1 Dec
  ];

  it("counts only live credits", () => {
    expect(balance(lots(), NOV)).toBe(230);
    expect(balance(lots(), monthEnd("2026-11"))).toBe(130); // the month's allowance is gone, no rollover
    expect(balance(lots(), NOV + 70 * DAY)).toBe(10); // the top-up has expired too
  });
  it("spends what expires soonest first: this month, then top-ups, then gifts", () => {
    const r = reserve(lots(), 150, NOV);
    expect(r).toMatchObject({ ok: true, taken: [{ lotId: "m:2026-11", credits: 100 }, { lotId: "t1", credits: 50 }] });
    if (r.ok) expect(balance(r.lots, NOV)).toBe(80);
  });
  it("is all or nothing, and changes nothing when refused", () => {
    const before = lots();
    expect(reserve(before, 231, NOV)).toEqual({ ok: false, needed: 231, have: 230 });
    expect(before).toEqual(lots());
  });
  it("never spends expired credits", () => {
    expect(reserve(lots(), 131, monthEnd("2026-11"))).toEqual({ ok: false, needed: 131, have: 130 });
  });
  it("a free job reserves nothing", () => {
    expect(reserve(lots(), 0, NOV)).toMatchObject({ ok: true, taken: [] });
  });
  it("rejects fractional or negative costs", () => {
    expect(() => reserve(lots(), 1.5, NOV)).toThrow();
    expect(() => reserve(lots(), -1, NOV)).toThrow();
  });
  it("a refund puts every credit back where it came from", () => {
    const r = reserve(lots(), 150, NOV);
    if (!r.ok) throw new Error("unreachable");
    expect(release(r.lots, r.taken, NOV + DAY, "refund:1")).toEqual(lots());
  });
  it("a refund after the lot expired comes back usable for 30 days", () => {
    const r = reserve(lots(), 100, NOV);
    if (!r.ok) throw new Error("unreachable");
    const later = monthEnd("2026-11") + DAY;
    const back = release(r.lots, r.taken, later, "refund:1");
    expect(back.at(-1)).toEqual({ id: "refund:1", kind: "grant", remaining: 100, expiresAt: later + 30 * DAY });
    expect(balance(back, later)).toBe(230);
  });
  it("reserve then full refund is a no-op for any cost", () => {
    for (let cost = 0; cost <= 230; cost += 23) {
      const r = reserve(lots(), cost, NOV);
      if (!r.ok) throw new Error("unreachable");
      expect(r.taken.reduce((n, t) => n + t.credits, 0)).toBe(cost);
      expect(release(r.lots, r.taken, NOV, "x")).toEqual(lots());
    }
  });
});

describe("settle", () => {
  const taken = [{ lotId: "m:2026-11", credits: 4 }, { lotId: "t1", credits: 6 }];
  it("charges what was made and gives the rest back, keeping the soonest-expiring credits", () => {
    expect(settle(taken, 7)).toEqual({ charged: [{ lotId: "m:2026-11", credits: 4 }, { lotId: "t1", credits: 3 }], back: [{ lotId: "t1", credits: 3 }] });
  });
  it("never charges more than was reserved", () => {
    expect(settle(taken, 99)).toEqual({ charged: taken, back: [] });
  });
  it("a job that made nothing is a full refund", () => {
    expect(settle(taken, 0)).toEqual({ charged: [], back: taken });
  });
  it("charged + back always equals what was reserved", () => {
    for (let a = 0; a <= 12; a++) {
      const s = settle(taken, a);
      const n = (t: typeof taken) => t.reduce((x, y) => x + y.credits, 0);
      expect(n(s.charged) + n(s.back)).toBe(10);
      expect(n(s.charged)).toBe(Math.min(a, 10));
    }
  });
});

describe("the proposed plans", () => {
  it("match the goal plan's allowances", () => {
    expect(PLAN_CATALOG.free).toMatchObject({ exportsPerMonth: 3, maxHeight: 720, watermark: true, oneTimeCredits: 10, monthlyCredits: 0 });
    expect(PLAN_CATALOG.creator).toMatchObject({ monthlyCredits: 100, maxHeight: 1080, watermark: false, exportsPerMonth: null, fairUseRawHours: 10 });
    expect(PLAN_CATALOG.pro).toMatchObject({ monthlyCredits: 500, maxHeight: 2160 });
    expect(PLAN_CATALOG.studio).toMatchObject({ monthlyCredits: 2500, seats: 3 });
    expect(PLAN_CATALOG.founding.monthlyCredits).toBe(PLAN_CATALOG.pro.monthlyCredits);
    expect(TOPUP_CREDITS).toBe(120);
  });
  it("generation can never cost more than the goal plan's worst case", () => {
    expect(worstCaseGenerationUsd("free")).toBe(0);
    expect(PLAN_CATALOG.free.oneTimeCredits * COST_PER_CREDIT_USD).toBeLessThan(0.5);
    expect(worstCaseGenerationUsd("creator")).toBeLessThanOrEqual(7);
    expect(worstCaseGenerationUsd("pro")).toBeLessThanOrEqual(20);
    expect(worstCaseGenerationUsd("studio")).toBeLessThanOrEqual(80);
    expect(TOPUP_CREDITS * COST_PER_CREDIT_USD).toBeCloseTo(3.6);
  });
});
