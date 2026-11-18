import { convexTest } from "convex-test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { balance, PLANS, PRO_PLAN, REFUND_GRACE_DAYS, TOPUP_DAYS } from "@eyelore/core";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { enqueueJob } from "./jobs";
import { ledgerFor, refundJobCredits } from "./lib/credits";

/** ADR 0014 wired: credits are generated seconds, held as lots that expire; reserve, settle, release. */

const modules = import.meta.glob("./**/*.ts");
const ALICE = { subject: "user_alice", email: "alice@example.com" };
const ANON = "anon_" + "a".repeat(32);
const DAY = 86_400_000;
const MONTHLY = PLANS[PRO_PLAN].monthlyCredits;
type T = ReturnType<typeof convexTest>;
const mk = () => convexTest(schema, modules);

afterEach(() => vi.useRealTimers());
const at = (iso: string) => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(iso));
};

/** An approved, paying Pro user (checkout grants this month's lot). */
async function pro(t: T, checkoutEvent = "evt_checkout") {
  const userId = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
  await t.run((ctx) => ctx.db.insert("flags", { key: "pro", enabled: true, rolloutPct: 0, allow: [ALICE.email] }));
  await t.mutation(internal.billing.applyStripeEvent, {
    eventId: checkoutEvent,
    type: "checkout.session.completed",
    object: { client_reference_id: userId, metadata: { kind: "plan", plan: PRO_PLAN }, payment_status: "paid", customer: "cus_1", subscription: "sub_1" },
  });
  return userId;
}
const lots = (t: T, userId: Id<"users">) => t.run((ctx) => ctx.db.query("creditLots").withIndex("by_user_lot", (q) => q.eq("userId", userId)).collect());
const bal = (t: T, userId: Id<"users">) => t.run(async (ctx) => balance((await ledgerFor(ctx, userId, Date.now())).lots, Date.now()));
const charges = (t: T) => t.run((ctx) => ctx.db.query("creditCharges").collect());
async function gpu(t: T) {
  const { token } = await t.mutation(internal.workers.register, { name: "gpu", provider: "modal-gpu" });
  const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  const hash = [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
  return (await t.mutation(internal.workers.touch, { tokenHash: hash }))!;
}
const i2v = (t: T, userId: Id<"users">, durationMs: number, key = "i2v:1") =>
  t.run((ctx) => enqueueJob(ctx, { type: "i2v", input: { mediaId: "m", prompt: "p", durationMs }, idempotencyKey: key, ownerUserId: userId, ownerAnonId: ANON }));

describe("reserve at enqueue, from the job's generated seconds", () => {
  it("a 4.2 s clip reserves 5 credits; a still 1; a look 0 but still needs Pro", async () => {
    const t = mk();
    const userId = await pro(t);
    await i2v(t, userId, 4200);
    expect(await bal(t, userId)).toBe(MONTHLY - 5);
    await t.run((ctx) => enqueueJob(ctx, { type: "still", input: { prompt: "p", w: 512, h: 512 }, idempotencyKey: "s", ownerUserId: userId }));
    expect(await bal(t, userId)).toBe(MONTHLY - 6);
    await t.run((ctx) => enqueueJob(ctx, { type: "grade", input: { mediaId: "m", look: "warm" }, idempotencyKey: "g", ownerUserId: userId }));
    expect(await bal(t, userId)).toBe(MONTHLY - 6);
    expect((await charges(t)).map((c) => c.credits)).toEqual([5, 1]);
    // a look is free but never for a free account
    await expect(t.run((ctx) => enqueueJob(ctx, { type: "grade", input: { mediaId: "m", look: "warm" }, idempotencyKey: "g2", ownerAnonId: ANON }))).rejects.toThrow(/pro_required/);
  });

  it("a per-second job whose length can't be told is refused with one line, and nothing is taken", async () => {
    const t = mk();
    const userId = await pro(t);
    await expect(t.run((ctx) => enqueueJob(ctx, { type: "matte", input: { mediaId: "nope" }, idempotencyKey: "mt", ownerUserId: userId }))).rejects.toThrow(
      "couldn't tell how many seconds this makes · nothing was charged",
    );
    expect(await bal(t, userId)).toBe(MONTHLY);
    expect(await t.run((ctx) => ctx.db.query("jobs").collect())).toHaveLength(0);
  });

  it("all or nothing: too few credits refuses with the numbers and takes nothing", async () => {
    const t = mk();
    const userId = await pro(t);
    await expect(i2v(t, userId, (MONTHLY + 1) * 1000)).rejects.toThrow(/credits_required/);
    expect(await bal(t, userId)).toBe(MONTHLY);
    expect(await charges(t)).toHaveLength(0);
  });

  it("no double charge under replay of the same idempotency key", async () => {
    const t = mk();
    const userId = await pro(t);
    const a = await i2v(t, userId, 3000);
    const b = await i2v(t, userId, 3000);
    expect(a).toBe(b);
    expect(await bal(t, userId)).toBe(MONTHLY - 3);
    expect(await charges(t)).toHaveLength(1);
  });
});

describe("settle on success, release on failure", () => {
  it("success settles what was made, once; a later failure report or delete refunds nothing", async () => {
    const t = mk();
    const userId = await pro(t);
    const w = await gpu(t);
    const jobId = await i2v(t, userId, 3000);
    await t.mutation(internal.jobs.claim, { workerId: w, types: ["i2v"] });
    expect(await t.mutation(internal.jobs.complete, { workerId: w, jobId, output: { mediaId: "out" } })).toEqual({ ok: true });
    expect(await t.mutation(internal.jobs.complete, { workerId: w, jobId, output: { mediaId: "out" } })).toMatchObject({ ok: false }); // replay: stale
    await t.mutation(internal.jobs.fail, { workerId: w, jobId, error: "late", retryable: false });
    expect((await charges(t))[0]).toMatchObject({ credits: 3, actual: 3 });
    expect((await charges(t))[0]!.refundedAt).toBeUndefined();
    expect(await bal(t, userId)).toBe(MONTHLY - 3);
  });

  it("voice reserves an estimate and settles on the real length, giving the rest back", async () => {
    const t = mk();
    const userId = await pro(t);
    const w = await gpu(t);
    const text = "one two three four five six seven eight nine ten"; // 10 words at 2.5/s → 4 s
    const jobId = await t.run((ctx) => enqueueJob(ctx, { type: "voice", input: { text, voiceId: "v", consentId: "c" }, idempotencyKey: "vo", ownerUserId: userId }));
    expect(await bal(t, userId)).toBe(MONTHLY - 4);
    await t.mutation(internal.jobs.claim, { workerId: w, types: ["voice"] });
    await t.mutation(internal.jobs.complete, { workerId: w, jobId, output: { mediaId: "o", words: [{ text: "one", startMs: 0, endMs: 2400, conf: 1 }] } });
    expect((await charges(t))[0]).toMatchObject({ credits: 4, actual: 3 });
    expect(await bal(t, userId)).toBe(MONTHLY - 3);
  });

  it("a final failure releases each credit to its lot, once", async () => {
    const t = mk();
    const userId = await pro(t);
    const w = await gpu(t);
    const jobId = await i2v(t, userId, 2000);
    await t.run((ctx) => ctx.db.patch(jobId, { maxAttempts: 1 }));
    await t.mutation(internal.jobs.claim, { workerId: w, types: ["i2v"] });
    await t.mutation(internal.jobs.fail, { workerId: w, jobId, error: "oom", retryable: true });
    expect((await charges(t))[0]).toMatchObject({ refundReason: "failed" });
    expect(await bal(t, userId)).toBe(MONTHLY);
    await t.mutation(internal.jobs.fail, { workerId: w, jobId, error: "again", retryable: false });
    expect(await bal(t, userId)).toBe(MONTHLY);
    expect((await lots(t, userId)).map((l) => l.lotId)).toEqual([expect.stringMatching(/^m:/)]); // back in its own lot, no new one
  });

  it("qc_failed is final even when retryable, never a success, and refunds", async () => {
    const t = mk();
    const userId = await pro(t);
    const w = await gpu(t);
    const jobId = await i2v(t, userId, 2000);
    await t.mutation(internal.jobs.claim, { workerId: w, types: ["i2v"] });
    await t.mutation(internal.jobs.fail, { workerId: w, jobId, error: "frozen frames", retryable: true, outcome: "qc_failed" });
    const job = await t.run((ctx) => ctx.db.get(jobId));
    expect(job).toMatchObject({ status: "failed", stage: "failed · quality check" });
    expect((await charges(t))[0]).toMatchObject({ refundReason: "qc_failed" });
    expect(await bal(t, userId)).toBe(MONTHLY);
  });

  it("a refund whose lot expired meanwhile comes back as a grant good for 30 days", async () => {
    at("2026-11-30T23:00:00Z");
    const t = mk();
    const userId = await pro(t);
    const w = await gpu(t);
    const jobId = await i2v(t, userId, 2000);
    await t.mutation(internal.jobs.claim, { workerId: w, types: ["i2v"] });
    vi.setSystemTime(new Date("2026-12-01T01:00:00Z")); // november's lot is gone
    await t.mutation(internal.jobs.fail, { workerId: w, jobId, error: "oom", retryable: false });
    const back = (await lots(t, userId)).find((l) => l.lotId.startsWith("r:"));
    expect(back).toMatchObject({ kind: "grant", remaining: 2 });
    expect(back!.expiresAt! - back!.createdAt).toBe(REFUND_GRACE_DAYS * DAY);
  });
});

describe("lots: what expires soonest is spent first", () => {
  it("monthly before a top-up before a migrated balance; a refund goes back where it came from", async () => {
    at("2026-11-17T12:00:00Z");
    const t = mk();
    const userId = await pro(t);
    await t.mutation(internal.billing.applyStripeEvent, {
      eventId: "evt_pack",
      type: "checkout.session.completed",
      object: { id: "cs_pack", client_reference_id: userId, metadata: { kind: "credits", pack: "small" }, payment_status: "paid", customer: "cus_1" },
    });
    const ent = await t.run((ctx) => ctx.db.query("entitlements").withIndex("by_user", (q) => q.eq("userId", userId)).unique());
    await t.run((ctx) => ctx.db.patch(ent!._id, { credits: 7 })); // a balance from before ADR 0014
    expect(await bal(t, userId)).toBe(MONTHLY + 100 + 7);

    await i2v(t, userId, (MONTHLY + 3) * 1000);
    const by = Object.fromEntries((await lots(t, userId)).map((l) => [l.lotId, l.remaining]));
    expect(by).toEqual({ "m:2026-11": 0, "t:cs_pack": 97, [`legacy:${ent!._id}`]: 7 });
    expect((await charges(t))[0]!.taken).toEqual([
      { lotId: "m:2026-11", credits: MONTHLY },
      { lotId: "t:cs_pack", credits: 3 },
    ]);
    const after = await t.run((ctx) => ctx.db.get(ent!._id));
    expect(after!.credits).toBe(0); // folded into its lot in the same transaction
  });

  it("a top-up lot lasts 12 months and is granted once per checkout session", async () => {
    at("2026-11-17T12:00:00Z");
    const t = mk();
    const userId = await pro(t);
    for (const eventId of ["evt_a", "evt_b"]) {
      await t.mutation(internal.billing.applyStripeEvent, {
        eventId,
        type: "checkout.session.completed",
        object: { id: "cs_same", client_reference_id: userId, metadata: { kind: "credits", pack: "small" }, payment_status: "paid" },
      });
    }
    const topups = (await lots(t, userId)).filter((l) => l.kind === "topup");
    expect(topups).toHaveLength(1);
    expect(topups[0]).toMatchObject({ lotId: "t:cs_same", remaining: 100 });
    expect(topups[0]!.expiresAt! - topups[0]!.createdAt).toBe(TOPUP_DAYS * DAY);
  });
});

describe("monthly allowance from the webhook", () => {
  const renew = (t: T, eventId: string) =>
    t.mutation(internal.billing.applyStripeEvent, { eventId, type: "customer.subscription.updated", object: { id: "sub_1", customer: "cus_1", status: "active", metadata: { plan: PRO_PLAN } } });

  it("once per UTC month as a lot that ends with the month: no rollover", async () => {
    at("2026-11-20T00:00:00Z");
    const t = mk();
    const userId = await pro(t);
    await renew(t, "evt_r1"); // same month: nothing more
    expect((await lots(t, userId)).map((l) => [l.lotId, l.remaining])).toEqual([["m:2026-11", MONTHLY]]);
    expect((await lots(t, userId))[0]!.expiresAt).toBe(Date.UTC(2026, 11, 1));

    vi.setSystemTime(new Date("2026-12-20T00:00:00Z"));
    await renew(t, "evt_r2");
    await renew(t, "evt_r3");
    expect((await lots(t, userId)).map((l) => l.lotId).sort()).toEqual(["m:2026-11", "m:2026-12"]);
    expect(await bal(t, userId)).toBe(MONTHLY); // november's unused credits are gone
  });

  it("a live subscription has this month's allowance from the 1st, before the renewal arrives; then the renewal adds nothing", async () => {
    at("2026-11-20T00:00:00Z");
    const t = mk();
    const userId = await pro(t);
    vi.setSystemTime(new Date("2026-12-02T00:00:00Z"));
    expect(await bal(t, userId)).toBe(MONTHLY);
    await i2v(t, userId, 2000);
    expect((await lots(t, userId)).find((l) => l.lotId === "m:2026-12")).toMatchObject({ remaining: MONTHLY - 2 });
    vi.setSystemTime(new Date("2026-12-20T00:00:00Z"));
    await renew(t, "evt_r");
    expect(await bal(t, userId)).toBe(MONTHLY - 2);
  });

  it("a balance granted this month before the migration is not granted again as a lot", async () => {
    at("2026-11-20T00:00:00Z");
    const t = mk();
    const userId = await pro(t);
    // the state a pre-ADR 0014 checkout left: the month's credits inside entitlements.credits, creditsPeriod set, no lots
    await t.run(async (ctx) => {
      for (const l of await ctx.db.query("creditLots").collect()) await ctx.db.delete(l._id);
      const ent = await ctx.db.query("entitlements").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
      await ctx.db.patch(ent!._id, { credits: MONTHLY });
    });
    await renew(t, "evt_r");
    expect(await bal(t, userId)).toBe(MONTHLY);
  });
});

describe("migration: entitlements.credits into a lot", () => {
  it("folds each balance into one never-expiring grant lot, idempotently", async () => {
    const t = mk();
    const userId = await pro(t);
    const ent = await t.run((ctx) => ctx.db.query("entitlements").withIndex("by_user", (q) => q.eq("userId", userId)).unique());
    await t.run((ctx) => ctx.db.patch(ent!._id, { credits: 12 }));
    expect(await t.mutation(internal.migrations.creditsToLots, {})).toEqual({ folded: 1, done: true });
    expect(await t.mutation(internal.migrations.creditsToLots, {})).toEqual({ folded: 0, done: true });
    const legacy = (await lots(t, userId)).find((l) => l.lotId === `legacy:${ent!._id}`);
    expect(legacy).toMatchObject({ kind: "grant", remaining: 12 });
    expect(legacy!.expiresAt).toBeUndefined();
    expect(await bal(t, userId)).toBe(MONTHLY + 12);
  });

  it("a job charged before ADR 0014 (no lots recorded) refunds into the migrated balance", async () => {
    const t = mk();
    const userId = await pro(t);
    const jobId = await i2v(t, userId, 2000);
    await t.run(async (ctx) => {
      const c = await ctx.db.query("creditCharges").first();
      await ctx.db.patch(c!._id, { taken: undefined });
    });
    await t.run(async (ctx) => {
      expect(await refundJobCredits(ctx, jobId, "cancelled")).toBe(true);
      expect(await refundJobCredits(ctx, jobId, "cancelled")).toBe(false);
    });
    const ent = await t.run((ctx) => ctx.db.query("entitlements").withIndex("by_user", (q) => q.eq("userId", userId)).unique());
    expect((await lots(t, userId)).find((l) => l.lotId === `legacy:${ent!._id}`)).toMatchObject({ remaining: 2 });
  });
});
