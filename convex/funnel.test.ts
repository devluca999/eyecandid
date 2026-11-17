import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import schema from "./schema";
import { api } from "./_generated/api";
import { FUNNEL_ROW_LIMIT } from "./funnel";

const modules = import.meta.glob("./**/*.ts");
const NOW = Date.UTC(2026, 10, 16, 12);
const DAY = 86_400_000;
const TOKEN = "test-token-not-a-secret";

type T = ReturnType<typeof convexTest>;
async function seed(t: T, rows: { name: string; anon: string; ts: number; props?: Record<string, unknown> }[]) {
  await t.run(async (ctx) => {
    for (const r of rows) {
      await ctx.db.insert("events", { name: r.name, anonHash: r.anon, props: r.props ?? { platform: "web" }, ts: r.ts });
    }
  });
}

describe("funnel.summary", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    vi.stubEnv("EYELORE_ADMIN_TOKEN", TOKEN);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("reports configured: false when EYELORE_ADMIN_TOKEN is unset", async () => {
    vi.stubEnv("EYELORE_ADMIN_TOKEN", "");
    const t = convexTest(schema, modules);
    expect(await t.query(api.funnel.summary, { token: "anything", days: 7 })).toEqual({ configured: false });
  });

  it("rejects a wrong token", async () => {
    const t = convexTest(schema, modules);
    await expect(t.query(api.funnel.summary, { token: "nope", days: 7 })).rejects.toThrow("not allowed");
    await expect(t.query(api.funnel.summary, { token: "", days: 7 })).rejects.toThrow("not allowed");
  });

  it("returns counts matching the seeded events with the right token", async () => {
    const t = convexTest(schema, modules);
    const ts = NOW - 1000;
    await seed(t, [
      { name: "landing_view", anon: "a", ts, props: { platform: "web", variant: "A" } },
      { name: "landing_view", anon: "a", ts: ts + 1, props: { platform: "web", variant: "A" } },
      { name: "landing_view", anon: "b", ts, props: { platform: "ios", variant: "B" } },
      { name: "drop_started", anon: "a", ts },
      { name: "first_preview", anon: "a", ts, props: { platform: "web", msSinceDrop: 12_000 } },
      { name: "export_done", anon: "a", ts, props: { platform: "web", variant: "A" } },
      { name: "job_roundtrip", anon: "a", ts }, // not a funnel step
    ]);
    const r = await t.query(api.funnel.summary, { token: TOKEN, days: 7 });
    if (!r.configured) throw new Error("expected configured");
    const step = (n: string) => r.steps.find((s) => s.name === n)!;
    expect(r.steps.map((s) => s.name)).toEqual([...FUNNEL_NAMES()]);
    expect(step("landing_view")).toMatchObject({ events: 3, sessions: 2, truncated: false });
    expect(step("drop_started")).toMatchObject({ events: 1, sessions: 1, fromPrev: 0.5 });
    expect(step("export_done")).toMatchObject({ events: 1, sessions: 1 });
    expect(r.byPlatform.find((p) => p.key === "ios")).toMatchObject({ landing: 1, exported: 0 });
    expect(r.byVariant.find((p) => p.key === "A")).toMatchObject({ landing: 1, exported: 1, conversion: 1 });
    expect(r.timeToWow).toEqual({ samples: 1, medianMs: 12_000, p90Ms: 12_000 });
  });

  it("filters by window", async () => {
    const t = convexTest(schema, modules);
    await seed(t, [
      { name: "landing_view", anon: "recent", ts: NOW - 3_600_000 },
      { name: "landing_view", anon: "week", ts: NOW - 3 * DAY },
      { name: "landing_view", anon: "month", ts: NOW - 20 * DAY },
      { name: "landing_view", anon: "ancient", ts: NOW - 40 * DAY },
    ]);
    const sessions = async (days: 1 | 7 | 30) => {
      const r = await t.query(api.funnel.summary, { token: TOKEN, days });
      if (!r.configured) throw new Error("expected configured");
      return r.steps[0]!.sessions;
    };
    expect(await sessions(1)).toBe(1);
    expect(await sessions(7)).toBe(2);
    expect(await sessions(30)).toBe(3);
  });

  it("flags truncation only for the step that hit the bound, keeping the newest rows", async () => {
    const t = convexTest(schema, modules);
    const rows = [];
    for (let i = 0; i < FUNNEL_ROW_LIMIT + 1; i++) rows.push({ name: "landing_view", anon: `s${i}`, ts: NOW - 10_000 + i });
    rows.push({ name: "drop_started", anon: "s0", ts: NOW - 5 });
    await seed(t, rows);
    const r = await t.query(api.funnel.summary, { token: TOKEN, days: 1 });
    if (!r.configured) throw new Error("expected configured");
    expect(r.steps[0]).toMatchObject({ name: "landing_view", truncated: true, events: FUNNEL_ROW_LIMIT });
    expect(r.steps[1]).toMatchObject({ name: "drop_started", truncated: false });
    expect(r.rowLimit).toBe(FUNNEL_ROW_LIMIT);
  });

  it("is not truncated at exactly the bound", async () => {
    const t = convexTest(schema, modules);
    const rows = [];
    for (let i = 0; i < FUNNEL_ROW_LIMIT; i++) rows.push({ name: "landing_view", anon: `s${i}`, ts: NOW - 10_000 + i });
    await seed(t, rows);
    const r = await t.query(api.funnel.summary, { token: TOKEN, days: 1 });
    if (!r.configured) throw new Error("expected configured");
    expect(r.steps[0]).toMatchObject({ truncated: false, events: FUNNEL_ROW_LIMIT });
  });
});

function FUNNEL_NAMES() {
  return [
    "landing_view", "drop_started", "upload_done", "first_preview", "edit_interaction", "export_clicked",
    "signup_prompted", "signup_done", "paywall_shown", "export_done", "share",
  ];
}
