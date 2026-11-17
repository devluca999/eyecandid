import { describe, expect, it } from "vitest";
import { clientIpFrom, mintClientHint, verifyClientHint } from "../src/clientHint";

describe("client hint", () => {
  it("mints a stable signed hash that never contains the IP", async () => {
    const a = await mintClientHint("203.0.113.9", "s3cret");
    expect(a).toMatch(/^[0-9a-f]{32}\.[0-9a-f]{16}$/);
    expect(a).toBe(await mintClientHint(" 203.0.113.9 ", "s3cret"));
    expect(a).not.toContain("203");
    expect(a).not.toBe(await mintClientHint("203.0.113.10", "s3cret"));
    expect(a).not.toBe(await mintClientHint("203.0.113.9", "other"));
  });
  it("verifies only with the same secret and an untouched signature", async () => {
    const hint = (await mintClientHint("203.0.113.9", "s3cret"))!;
    expect(await verifyClientHint(hint, "s3cret")).toBe(hint.slice(0, 32));
    expect(await verifyClientHint(hint, "other")).toBeNull();
    expect(await verifyClientHint(hint.slice(0, 33) + "0".repeat(16), "s3cret")).toBeNull();
    expect(await verifyClientHint("a".repeat(32) + "." + "b".repeat(16), "s3cret")).toBeNull();
    expect(await verifyClientHint("garbage", "s3cret")).toBeNull();
    expect(await verifyClientHint(hint, undefined)).toBeNull();
  });
  it("is off without a secret or an address", async () => {
    expect(await mintClientHint("1.2.3.4", undefined)).toBeNull();
    expect(await mintClientHint("", "s3cret")).toBeNull();
    expect(await mintClientHint(null, "s3cret")).toBeNull();
  });
  it("takes the first x-forwarded-for address", () => {
    const h = (m: Record<string, string>) => ({ get: (k: string) => m[k] ?? null });
    expect(clientIpFrom(h({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
    expect(clientIpFrom(h({ "x-real-ip": "198.51.100.2" }))).toBe("198.51.100.2");
    expect(clientIpFrom(h({}))).toBeNull();
  });
});
