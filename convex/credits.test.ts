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

  it("voice: text without spaces is estimated by characters, and a longer real length is charged when the balance allows", async () => {
    const t = mk();
    const userId = await pro(t);
    const w = await gpu(t);
    await t.mutation(internal.billing.applyStripeEvent, {
      eventId: "evt_pack",
      type: "checkout.session.completed",
      object: { id: "cs_pack", client_reference_id: userId, metadata: { kind: "credits", pack: "small" }, payment_status: "paid" },
    });
    const text = Array.from({ length: 150 }, (_, i) => `word${i}`).join(","); // 150 spoken words, zero spaces
    const jobId = await t.run((ctx) => enqueueJob(ctx, { type: "voice", input: { text, voiceId: "v", consentId: "c" }, idempotencyKey: "vo", ownerUserId: userId }));
    expect((await charges(t))[0]!.credits).toBeGreaterThanOrEqual(60); // reserved by characters, not 1
    await t.mutation(internal.jobs.claim, { workerId: w, types: ["voice"] });
    await t.mutation(internal.jobs.complete, { workerId: w, jobId, output: { mediaId: "o", words: [{ text: "x", startMs: 0, endMs: 60_000, conf: 1 }] } });
    const charge = (await charges(t))[0]!;
    expect(charge.actual).toBe(60);
    expect(await bal(t, userId)).toBe(MONTHLY + 100 - 60);
  });

  it("voice: when the real length outruns the reservation, the difference is taken if it can be, else noted", async () => {
    const t = mk();
    const userId = await pro(t);
    const w = await gpu(t);
    const run = async (key: string, endMs: number) => {
      const jobId = await t.run((ctx) => enqueueJob(ctx, { type: "voice", input: { text: "hello there", voiceId: "v", consentId: "c" }, idempotencyKey: key, ownerUserId: userId }));
      await t.mutation(internal.jobs.claim, { workerId: w, types: ["voice"] });
      await t.mutation(internal.jobs.complete, { workerId: w, jobId, output: { mediaId: "o", words: [{ text: "x", startMs: 0, endMs, conf: 1 }] } });
      return (await t.run((ctx) => ctx.db.query("creditCharges").withIndex("by_job", (q) => q.eq("jobId", jobId)).unique()))!;
    };
    const a = await run("v1", 5_000); // reserved 1, made 5: 4 more taken
    expect(a).toMatchObject({ credits: 5, actual: 5 });
    expect(a.taken!.reduce((n, x) => n + x.credits, 0)).toBe(5);
    expect(await bal(t, userId)).toBe(MONTHLY - 5);
    const b = await run("v2", (MONTHLY + 10) * 1000); // more than is left: settles at the reservation
    expect(b).toMatchObject({ credits: 1, actual: 1, uncharged: MONTHLY + 10 - 1 });
    expect(await bal(t, userId)).toBe(MONTHLY - 6);
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
    expect((await lots(t, userId)).map((l) => l.lotId)).toEqual(["p:sub_1:first"]); // back in its own lot, no new one
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

  it("our failure after the lot expired: the credits come back as a grant good for 30 days", async () => {
    at("2026-11-30T23:00:00Z");
    const t = mk();
    const userId = await pro(t);
    const w = await gpu(t);
    const jobId = await i2v(t, userId, 2000);
    await t.mutation(internal.jobs.claim, { workerId: w, types: ["i2v"] });
    vi.setSystemTime(new Date("2026-12-31T01:00:00Z")); // the first period's lot (to Dec 30 23:00) is gone
    await t.mutation(internal.jobs.fail, { workerId: w, jobId, error: "oom", retryable: false });
    const back = (await lots(t, userId)).find((l) => l.lotId.startsWith("r:"));
    expect(back).toMatchObject({ kind: "grant", remaining: 2 });
    expect(back!.expiresAt! - back!.createdAt).toBe(REFUND_GRACE_DAYS * DAY);
  });

  it("the person deleting their edit after the lot expired: the credits lapse with it, no 30-day grant", async () => {
    at("2026-11-30T23:00:00Z");
    const t = mk();
    const userId = await pro(t);
    const projectId = await t.withIdentity(ALICE).mutation(api.projects.create, { anonId: ANON });
    await t.run((ctx) => enqueueJob(ctx, { type: "i2v", input: { mediaId: "m", prompt: "p", durationMs: 2000 }, idempotencyKey: "del", projectId, ownerUserId: userId, ownerAnonId: ANON }));
    vi.setSystemTime(new Date("2026-12-31T01:00:00Z"));
    await t.withIdentity(ALICE).mutation(api.projects.remove, { projectId });
    await t.finishAllScheduledFunctions(() => {});
    expect((await charges(t))[0]).toMatchObject({ refundReason: "cancelled" });
    expect((await lots(t, userId)).some((l) => l.lotId.startsWith("r:"))).toBe(false);
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
    expect(by).toEqual({ "p:sub_1:first": 0, "t:cs_pack": 97, [`legacy:${ent!._id}`]: 7 });
    expect((await charges(t))[0]!.taken).toEqual([
      { lotId: "p:sub_1:first", credits: MONTHLY },
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

describe("plan credits per paid Stripe period", () => {
  const S = (iso: string) => Date.parse(iso) / 1000;
  const invoice = (t: T, eventId: string, o: { id: string; reason: string; start: number; end: number; paid?: number }) =>
    t.mutation(internal.billing.applyStripeEvent, {
      eventId,
      type: "invoice.paid",
      object: { id: o.id, customer: "cus_1", subscription: "sub_1", billing_reason: o.reason, amount_paid: o.paid ?? 1900, lines: { data: [{ period: { start: o.start, end: o.end } }] } },
    });
  const update = (t: T, eventId: string) =>
    t.mutation(internal.billing.applyStripeEvent, { eventId, type: "customer.subscription.updated", object: { id: "sub_1", customer: "cus_1", status: "active", metadata: { plan: PRO_PLAN } } });

  it("checkout grants the first period; its invoice corrects the end and adds nothing; replays add nothing", async () => {
    at("2026-11-20T00:00:00Z");
    const t = mk();
    const userId = await pro(t);
    expect((await lots(t, userId)).map((l) => [l.lotId, l.remaining])).toEqual([["p:sub_1:first", MONTHLY]]);
    await invoice(t, "evt_i1", { id: "in_1", reason: "subscription_create", start: S("2026-11-20T00:00:00Z"), end: S("2026-12-20T00:00:00Z") });
    await invoice(t, "evt_i1b", { id: "in_1", reason: "subscription_create", start: S("2026-11-20T00:00:00Z"), end: S("2026-12-20T00:00:00Z") });
    const l = await lots(t, userId);
    expect(l).toHaveLength(1);
    expect(l[0]).toMatchObject({ remaining: MONTHLY, expiresAt: Date.parse("2026-12-20T00:00:00Z") });
  });

  it("each paid renewal is one lot that ends with its period: no rollover, and an update alone grants nothing", async () => {
    at("2026-11-20T00:00:00Z");
    const t = mk();
    const userId = await pro(t);
    vi.setSystemTime(new Date("2026-12-20T00:00:05Z"));
    expect(await bal(t, userId)).toBe(0); // the first period ended; nothing until the next one is paid
    await update(t, "evt_u");
    expect(await bal(t, userId)).toBe(0);
    const r = { id: "in_2", reason: "subscription_cycle", start: S("2026-12-20T00:00:00Z"), end: S("2027-01-20T00:00:00Z") };
    await invoice(t, "evt_r2", r);
    await invoice(t, "evt_r2_again", r);
    expect(await bal(t, userId)).toBe(MONTHLY);
    expect((await lots(t, userId)).map((x) => x.lotId).sort()).toEqual([`p:sub_1:${r.start}`, "p:sub_1:first"]);
  });

  it("a $0 invoice (a trial) and a checkout without payment grant nothing", async () => {
    at("2026-11-20T00:00:00Z");
    const t = mk();
    const userId = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    await t.mutation(internal.billing.applyStripeEvent, {
      eventId: "evt_trial",
      type: "checkout.session.completed",
      object: { client_reference_id: userId, metadata: { kind: "plan", plan: PRO_PLAN }, payment_status: "no_payment_required", customer: "cus_1", subscription: "sub_1" },
    });
    await invoice(t, "evt_i0", { id: "in_0", reason: "subscription_create", start: S("2026-11-20T00:00:00Z"), end: S("2026-12-20T00:00:00Z"), paid: 0 });
    expect(await lots(t, userId)).toHaveLength(0);
  });

  it("one subscription payment never buys two months of credits", async () => {
    at("2026-11-30T12:00:00Z");
    const t = mk();
    const userId = await pro(t);
    let spent = 0;
    const spend = async (key: string) => {
      const b = await bal(t, userId);
      if (b > 0) await i2v(t, userId, b * 1000, key);
      spent += b;
    };
    await spend("nov");
    vi.setSystemTime(new Date("2026-12-01T00:00:01Z"));
    await spend("dec");
    expect(spent).toBeLessThanOrEqual(MONTHLY);
  });

  it("a returning subscriber from before ADR 0014, on a new subscription, is granted the period they paid for", async () => {
    at("2027-01-10T00:00:00Z");
    const t = mk();
    const userId = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    await t.run(async (ctx) => {
      const ent = await ctx.db.query("entitlements").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
      await ctx.db.patch(ent!._id, { creditsPeriod: "2026-09", stripeSubscriptionId: "sub_old" }); // subscribed in September, old code
    });
    await t.mutation(internal.billing.applyStripeEvent, {
      eventId: "evt_co2",
      type: "checkout.session.completed",
      object: { client_reference_id: userId, metadata: { kind: "plan", plan: PRO_PLAN }, payment_status: "paid", customer: "cus_1", subscription: "sub_new" },
    });
    await t.mutation(internal.billing.applyStripeEvent, {
      eventId: "evt_i",
      type: "invoice.paid",
      object: { id: "in_1", customer: "cus_1", subscription: "sub_new", billing_reason: "subscription_create", amount_paid: 1900, lines: { data: [{ period: { start: S("2027-01-10T00:00:00Z"), end: S("2027-02-10T00:00:00Z") } }] } },
    });
    expect(await bal(t, userId)).toBe(MONTHLY);
  });

  it("a mid-period plan change (a proration invoice) grants nothing; the next renewal does", async () => {
    at("2026-11-20T00:00:00Z");
    const t = mk();
    const userId = await pro(t);
    vi.setSystemTime(new Date("2026-12-05T00:00:00Z"));
    await t.mutation(internal.billing.applyStripeEvent, {
      eventId: "evt_up",
      type: "invoice.paid",
      object: { id: "in_p", customer: "cus_1", subscription: "sub_1", billing_reason: "subscription_update", amount_paid: 300, lines: { data: [{ proration: true, period: { start: S("2026-12-05T00:00:00Z"), end: S("2026-12-20T00:00:00Z") } }] } },
    });
    expect(await bal(t, userId)).toBe(MONTHLY);
  });

  it("a renewal invoice with a proration line first: the period and plan come from the subscription's own line", async () => {
    at("2026-12-20T00:00:05Z");
    const t = mk();
    const userId = await pro(t);
    process.env.STRIPE_PRICE_CREATOR = "price_creator";
    try {
      await t.mutation(internal.billing.applyStripeEvent, {
        eventId: "evt_r",
        type: "invoice.paid",
        object: {
          id: "in_r",
          customer: "cus_1",
          subscription: "sub_1",
          billing_reason: "subscription_cycle",
          amount_paid: 2100,
          lines: {
            data: [
              { type: "invoiceitem", proration: true, price: { id: "price_other" }, period: { start: S("2026-12-10T00:00:00Z"), end: S("2026-12-20T00:00:00Z") } },
              { type: "subscription", proration: false, price: { id: "price_creator" }, period: { start: S("2026-12-20T00:00:00Z"), end: S("2027-01-20T00:00:00Z") } },
            ],
          },
        },
      });
    } finally {
      delete process.env.STRIPE_PRICE_CREATOR;
    }
    const lot = (await lots(t, userId)).find((l) => l.lotId === `p:sub_1:${S("2026-12-20T00:00:00Z")}`);
    expect(lot).toMatchObject({ remaining: PLANS.creator.monthlyCredits, expiresAt: Date.parse("2027-01-20T00:00:00Z") });
  });

  it("an account whose first period was paid into the old balance (before ADR 0014) is not granted it again", async () => {
    at("2026-11-20T00:00:00Z");
    const t = mk();
    const userId = await pro(t);
    // the state a pre-ADR 0014 checkout left: the credits inside entitlements.credits, creditsPeriod set, no lots
    await t.run(async (ctx) => {
      for (const l of await ctx.db.query("creditLots").collect()) await ctx.db.delete(l._id);
      const ent = await ctx.db.query("entitlements").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
      await ctx.db.patch(ent!._id, { credits: MONTHLY, creditsPeriod: "2026-11" });
    });
    await invoice(t, "evt_i1", { id: "in_1", reason: "subscription_create", start: S("2026-11-20T00:00:00Z"), end: S("2026-12-20T00:00:00Z") });
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
