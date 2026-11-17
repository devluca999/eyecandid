import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const ANON = "anon_" + "a".repeat(32);
const OTHER = "anon_" + "b".repeat(32);
const ask = (over: Partial<{ anonId: string; email: string; note: string; link: string }> = {}) => ({
  anonId: ANON, email: "Maker@Example.com ", note: "ugc for my candle shop", link: "example.com/reels", ...over,
});

describe("accessRequests.request", () => {
  it("stores a valid request, normalised, as new", async () => {
    const t = convexTest(schema, modules);
    expect(await t.mutation(api.access.request, ask())).toEqual({ ok: true });
    const rows = await t.run((ctx) => ctx.db.query("accessRequests").collect());
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ email: "maker@example.com", note: "ugc for my candle shop", link: "https://example.com/reels", status: "new" });
    expect(rows[0]!.anonHash).toMatch(/^[0-9a-f]{32}$/);
    expect(rows[0]!.anonHash).not.toContain(ANON.slice(5));
  });

  it("rejects a bad email, a bad link and a bad anon id", async () => {
    const t = convexTest(schema, modules);
    await expect(t.mutation(api.access.request, ask({ email: "not-an-email" }))).rejects.toThrow(/email/);
    await expect(t.mutation(api.access.request, ask({ email: "a@b" }))).rejects.toThrow(/email/);
    await expect(t.mutation(api.access.request, ask({ link: "javascript:alert(1)" }))).rejects.toThrow(/link/);
    await expect(t.mutation(api.access.request, ask({ note: "x".repeat(501) }))).rejects.toThrow(/500/);
    await expect(t.mutation(api.access.request, ask({ anonId: "nope" }))).rejects.toThrow();
    expect(await t.run((ctx) => ctx.db.query("accessRequests").collect())).toHaveLength(0);
  });

  it("allows 3 a day per email and per anonymous session", async () => {
    const t = convexTest(schema, modules);
    for (let i = 0; i < 3; i++) await t.mutation(api.access.request, ask({ email: `m${i}@example.com` }));
    // a 4th from the same session, new email
    await expect(t.mutation(api.access.request, ask({ email: "m9@example.com" }))).rejects.toThrow(/already asked/);
    // the same email from other sessions, case and spaces aside
    for (let i = 0; i < 2; i++) await t.mutation(api.access.request, ask({ anonId: OTHER, email: " M0@example.com" }));
    await expect(t.mutation(api.access.request, ask({ anonId: "anon_" + "c".repeat(32), email: "m0@EXAMPLE.com" }))).rejects.toThrow(/already asked/);
    // without an anon id the email limit still holds
    await expect(t.mutation(api.access.request, { email: "m0@example.com", note: "", link: "" })).rejects.toThrow(/already asked/);
    expect(await t.run((ctx) => ctx.db.query("accessRequests").collect())).toHaveLength(5);
  });

  it("frees up after 24 hours", async () => {
    const t = convexTest(schema, modules);
    const old = Date.now() - 25 * 60 * 60 * 1000;
    await t.run(async (ctx) => {
      for (let i = 0; i < 3; i++) await ctx.db.insert("accessRequests", { email: "late@example.com", note: "", link: "", createdAt: old, status: "new" });
    });
    expect(await t.mutation(api.access.request, ask({ email: "late@example.com" }))).toEqual({ ok: true });
  });
});
