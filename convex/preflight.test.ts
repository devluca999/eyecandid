import { convexTest } from "convex-test";
import { describe, expect, it } from "vitest";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import { MSG } from "./lib/limits";

const modules = import.meta.glob("./**/*.ts");
const ANON = "anon_" + "a".repeat(32);

describe("drop preflight (refuse on the landing, before an edit exists)", () => {
  it("says the same one-line refusals the upload path enforces, and nothing for a clip that's fine", async () => {
    const t = convexTest(schema, modules);
    const ask = (durationMs: number, bytes: number, onDevice = false) => t.query(api.projects.preflight, { anonId: ANON, durationMs, bytes, onDevice });
    expect(await ask(20_000, 5_000_000)).toBeNull();
    expect(await ask(65_000, 5_000_000)).toBe(MSG.clipLong);
    expect(await ask(65_000, 5_000_000, true)).toBe(MSG.clipLong); // the length cap holds on device too
    expect(await ask(20_000, 300 * 1024 * 1024)).toBe(MSG.fileBig);
    expect(await ask(20_000, 300 * 1024 * 1024, true)).toBeNull(); // nothing is uploaded on device
  });

  it("a paused free day is said for the server engine; the device engine costs nothing and stays open", async () => {
    const t = convexTest(schema, modules);
    await t.mutation(internal.flags.set, { key: "free_paused", enabled: true });
    expect(await t.query(api.projects.preflight, { anonId: ANON, durationMs: 20_000, bytes: 5_000_000, onDevice: false })).toBe(MSG.paused);
    expect(await t.query(api.projects.preflight, { anonId: ANON, durationMs: 20_000, bytes: 5_000_000, onDevice: true })).toBeNull();
  });

  it("a mistyped edit link is not found, not a crash", async () => {
    const t = convexTest(schema, modules);
    expect(await t.query(api.projects.get, { projectId: "not-an-edit", anonId: ANON })).toBeNull();
  });
});
