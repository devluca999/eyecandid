import { beforeEach, describe, expect, it } from "vitest";
import { markProOfferSeen, proOfferSeen, shouldOfferPro } from "./pro-offer";

const base = { exportedFree: true, pro: false, seen: false, latched: false };

describe("pro offer once", () => {
  it("opens after the first free export", () => expect(shouldOfferPro(base)).toBe(true));
  it("never before an export, or after a paid (unwatermarked) one", () => expect(shouldOfferPro({ ...base, exportedFree: false })).toBe(false));
  it("never on paid plans, and not while the plan is still loading", () => {
    expect(shouldOfferPro({ ...base, pro: true })).toBe(false);
    expect(shouldOfferPro({ ...base, pro: undefined })).toBe(false);
  });
  it("only once: remembered, and latched for the rest of this load", () => {
    expect(shouldOfferPro({ ...base, seen: true })).toBe(false);
    expect(shouldOfferPro({ ...base, latched: true })).toBe(false);
  });
});

describe("pro offer memory", () => {
  const store = new Map<string, string>();
  beforeEach(() => {
    store.clear();
    (globalThis as { localStorage?: unknown }).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  });
  it("is per anon session", () => {
    expect(proOfferSeen("anon_a")).toBe(false);
    markProOfferSeen("anon_a");
    expect(proOfferSeen("anon_a")).toBe(true);
    expect(proOfferSeen("anon_b")).toBe(false);
  });
  it("survives blocked storage without throwing", () => {
    (globalThis as { localStorage?: unknown }).localStorage = {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    };
    expect(proOfferSeen("anon_a")).toBe(false);
    expect(() => markProOfferSeen("anon_a")).not.toThrow();
  });
});
