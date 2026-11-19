import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");
const ANON = "anon_" + "c".repeat(32);
const TOKEN = "side-events-token";

describe("events.track side events", () => {
  it("accepts ready_email_left, access_requested and checkout_started, and /funnel counts them", async () => {
    process.env.EYELORE_ADMIN_TOKEN = TOKEN;
    const t = convexTest(schema, modules);
    await t.mutation(api.events.track, { anonId: ANON, event: { name: "ready_email_left", props: { platform: "web" } } });
    await t.mutation(api.events.track, { anonId: ANON, event: { name: "access_requested", props: { platform: "web" } } });
    await t.mutation(api.events.track, { anonId: ANON, event: { name: "checkout_started", props: { platform: "web", plan: "creator" } } });
    await t.mutation(api.events.track, { anonId: ANON, event: { name: "checkout_started", props: { platform: "web" } } });
    await expect(t.mutation(api.events.track, { anonId: ANON, event: { name: "checkout_started", props: { platform: "tv" } } })).rejects.toThrow();
    const rows = await t.run((ctx) => ctx.db.query("events").collect());
    expect(rows.map((r) => r.name).sort()).toEqual(["access_requested", "checkout_started", "checkout_started", "ready_email_left"]);
    const r = await t.query(api.funnel.summary, { token: TOKEN, days: 1 });
    if (!r.configured) throw new Error("expected configured");
    expect(r.counted).toEqual([
      { name: "ready_email_left", events: 1, truncated: false },
      { name: "access_requested", events: 1, truncated: false },
      { name: "checkout_started", events: 2, truncated: false },
    ]);
    expect(r.steps.map((s) => s.name)).not.toContain("checkout_started");
  });
});
