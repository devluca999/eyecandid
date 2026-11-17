import { convexTest } from "convex-test";
import { expect, it } from "vitest";
import schema from "./schema";
import { internal } from "./_generated/api";

const modules = import.meta.glob("./**/*.ts");

it("flags.set keeps a stored allowlist and rollout when the call leaves them out", async () => {
  const t = convexTest(schema, modules);
  await t.mutation(internal.flags.set, { key: "pro", enabled: true, rolloutPct: 0, allow: ["a@example.com"] });
  await t.mutation(internal.flags.set, { key: "pro", enabled: true });
  const row = await t.run((ctx) => ctx.db.query("flags").withIndex("by_key", (q) => q.eq("key", "pro")).unique());
  expect(row).toMatchObject({ rolloutPct: 0, allow: ["a@example.com"] });
  await t.mutation(internal.flags.set, { key: "pro", enabled: true, allow: [] }); // an explicit empty list still clears it
  expect((await t.run((ctx) => ctx.db.query("flags").withIndex("by_key", (q) => q.eq("key", "pro")).unique()))!.allow).toEqual([]);
});
