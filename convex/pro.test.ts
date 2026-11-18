import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { balance, PLANS, PRO_PLAN } from "@eyelore/core";
import { ledgerFor } from "./lib/credits";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { enqueueJob } from "./jobs";
import { proSeats } from "./access";

/** Phase 4: request access → admin approve/decline → Pro entitlement → GPU jobs gated by credits. */

const modules = import.meta.glob("./**/*.ts");
const ADMIN = "test-admin-token";
const ALICE = { subject: "user_alice", email: "alice@example.com" };
const BOB = { subject: "user_bob", email: "bob@example.com" };
const anon = (c: string) => "anon_" + c.repeat(32);

type T = ReturnType<typeof convexTest>;
const mk = () => convexTest(schema, modules);

const ENV = ["EYELORE_ADMIN_TOKEN", "EYELORE_PRO_SEATS", "SENDPULSE_CLIENT_ID", "SENDPULSE_CLIENT_SECRET", "SENDPULSE_FROM_EMAIL", "EYELORE_WEB_URL", "STRIPE_SECRET_KEY", "STRIPE_PRICE_CREATOR"];
let saved: Record<string, string | undefined> = {};
beforeEach(() => {
  saved = Object.fromEntries(ENV.map((k) => [k, process.env[k]]));
  for (const k of ENV) delete process.env[k];
  process.env.EYELORE_ADMIN_TOKEN = ADMIN;
});
afterEach(() => {
  for (const k of ENV) {
    if (saved[k] === undefined) delete process.env[k];
    else process.env[k] = saved[k];
  }
  vi.unstubAllGlobals();
});

async function ask(t: T, email: string, c = "a") {
  await t.mutation(api.access.request, { anonId: anon(c), email, note: "ugc ads", link: "" });
  const rows = await t.run((ctx) => ctx.db.query("accessRequests").withIndex("by_email_created", (q) => q.eq("email", email.toLowerCase())).collect());
  return rows[0]!._id;
}
const row = (t: T, id: Id<"accessRequests">) => t.run((ctx) => ctx.db.get(id));
const proFlag = (t: T) => t.run((ctx) => ctx.db.query("flags").withIndex("by_key", (q) => q.eq("key", "pro")).unique());
const approve = (t: T, requestId: Id<"accessRequests">, token = ADMIN) => t.mutation(api.access.approve, { token, requestId });

describe("admin access: gate", () => {
  it("is not configured without EYELORE_ADMIN_TOKEN, and refuses a wrong token", async () => {
    const t = mk();
    const id = await ask(t, "m@example.com");
    expect(await t.query(api.access.adminList, { token: "nope" })).toEqual({ state: "denied" });
    await expect(approve(t, id, "nope")).rejects.toThrow(/not allowed/);
    await expect(t.mutation(api.access.decline, { token: "nope", requestId: id })).rejects.toThrow(/not allowed/);
    delete process.env.EYELORE_ADMIN_TOKEN;
    expect(await t.query(api.access.adminList, { token: ADMIN })).toEqual({ state: "unconfigured" });
    await expect(approve(t, id)).rejects.toThrow(/not configured/);
    expect((await row(t, id))!.status).toBe("new");
  });

  it("lists new requests first, with seats used of the cap", async () => {
    const t = mk();
    const a = await ask(t, "a@example.com", "a");
    await ask(t, "b@example.com", "b");
    await approve(t, a);
    const list = await t.query(api.access.adminList, { token: ADMIN });
    if (list.state !== "ok") throw new Error("expected ok");
    expect(list.seats).toEqual({ used: 1, cap: 100 });
    expect(list.rows.map((r) => [r.email, r.status])).toEqual([["b@example.com", "new"], ["a@example.com", "approved"]]);
    expect(list.rows[0]).not.toHaveProperty("anonHash");
  });
});

describe("admin access: approve and decline", () => {
  it("approve: status, pro allow list (flag created allow-list only), email queued then not sent without SendPulse", async () => {
    const t = mk();
    const id = await ask(t, "Maker@Example.com");
    expect(await approve(t, id)).toEqual({ ok: true, seats: { used: 1, cap: 100 } });
    expect(await row(t, id)).toMatchObject({ status: "approved", emailStatus: "queued" });
    expect(await proFlag(t)).toMatchObject({ enabled: true, rolloutPct: 0, allow: ["maker@example.com"] });
    await t.finishAllScheduledFunctions(() => {});
    const r = (await row(t, id))!;
    expect(r).toMatchObject({ emailStatus: "not_sent", emailDetail: "not sent · SendPulse not configured" });
    expect(r.inviteTokenHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it("approving twice takes one seat and sends one email", async () => {
    const t = mk();
    const id = await ask(t, "m@example.com");
    await approve(t, id);
    await t.finishAllScheduledFunctions(() => {});
    expect(await approve(t, id)).toMatchObject({ ok: true, already: true, seats: { used: 1 } });
    expect((await proFlag(t))!.allow).toEqual(["m@example.com"]);
    expect((await row(t, id))!.emailStatus).toBe("not_sent"); // no second queue
  });

  it("keeps an existing pro flag row's settings and adds to its allow list", async () => {
    const t = mk();
    await t.run((ctx) => ctx.db.insert("flags", { key: "pro", enabled: true, rolloutPct: 0, allow: ["first@example.com"] }));
    await approve(t, await ask(t, "second@example.com"));
    expect((await proFlag(t))!.allow).toEqual(["first@example.com", "second@example.com"]);
  });

  it("refuses past the seat cap with an honest message (EYELORE_PRO_SEATS)", async () => {
    process.env.EYELORE_PRO_SEATS = "2";
    const t = mk();
    const ids = [await ask(t, "a@example.com", "a"), await ask(t, "b@example.com", "b"), await ask(t, "c@example.com", "c")];
    await approve(t, ids[0]!);
    await approve(t, ids[1]!);
    const r = await approve(t, ids[2]!);
    expect(r).toEqual({ ok: false, error: "all 2 Pro seats are taken · decline someone or raise EYELORE_PRO_SEATS", seats: { used: 2, cap: 2 } });
    expect((await row(t, ids[2]!))!.status).toBe("new");
    expect((await proFlag(t))!.allow).not.toContain("c@example.com");
    // declining an approved request frees its seat and takes it off the allow list
    await t.mutation(api.access.decline, { token: ADMIN, requestId: ids[0]! });
    expect((await proFlag(t))!.allow).not.toContain("a@example.com");
    expect(await approve(t, ids[2]!)).toMatchObject({ ok: true, seats: { used: 2, cap: 2 } });
  });

  it("seat cap defaults to 100 and ignores a malformed value", () => {
    expect(proSeats(undefined)).toBe(100);
    expect(proSeats("")).toBe(100);
    expect(proSeats("lots")).toBe(100);
    expect(proSeats("-3")).toBe(100);
    expect(proSeats("2.5")).toBe(100);
    expect(proSeats("40")).toBe(40);
  });

  it("decline: sets declined, no email, nothing on the allow list", async () => {
    const t = mk();
    const id = await ask(t, "no@example.com");
    expect(await t.mutation(api.access.decline, { token: ADMIN, requestId: id })).toEqual({ ok: true });
    await t.finishAllScheduledFunctions(() => {});
    const r = (await row(t, id))!;
    expect(r.status).toBe("declined");
    expect(r.emailStatus).toBeUndefined();
    expect(await proFlag(t)).toBeNull();
  });

  it("with SendPulse configured, sends 'you're in' with a /pro/checkout link whose token is stored only hashed", async () => {
    process.env.SENDPULSE_CLIENT_ID = "id";
    process.env.SENDPULSE_CLIENT_SECRET = "secret";
    process.env.SENDPULSE_FROM_EMAIL = "hello@eyelore.test";
    process.env.EYELORE_WEB_URL = "https://eyecandid.test";
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(url.includes("oauth") ? { access_token: "tok" } : { result: true }), { status: 200 });
    });
    const t = mk();
    const id = await ask(t, "maker@example.com");
    await approve(t, id);
    await t.finishAllScheduledFunctions(() => {});
    const mail = JSON.parse(String(calls[1]!.init.body)).email;
    expect(mail.to).toEqual([{ email: "maker@example.com" }]);
    expect(mail.subject).toMatch(/you're in/i);
    const token = /\/pro\/checkout\?token=(eci_[0-9a-f]{64})/.exec(mail.text)![1]!;
    expect(atob(mail.html)).toContain(`https://eyecandid.test/pro/checkout?token=${token}`);
    const r = (await row(t, id))!;
    expect(r.emailStatus).toBe("sent");
    expect(JSON.stringify(r)).not.toContain(token);
    // the link is good, and payment is honestly off (no Stripe key, no billing flag)
    expect(await t.query(api.access.invite, { token })).toEqual({ valid: true, email: "m•••@example.com", billing: false });
    expect(await t.query(api.access.invite, { token: "eci_" + "0".repeat(64) })).toEqual({ valid: false });
    // a declined request's link stops working
    await t.mutation(api.access.decline, { token: ADMIN, requestId: id });
    expect(await t.query(api.access.invite, { token })).toEqual({ valid: false });
  });
});

describe("pro checkout from the invite link", () => {
  async function invited(t: T, email: string) {
    process.env.SENDPULSE_CLIENT_ID = "id";
    process.env.SENDPULSE_CLIENT_SECRET = "secret";
    process.env.SENDPULSE_FROM_EMAIL = "hello@eyelore.test";
    process.env.EYELORE_WEB_URL = "https://eyecandid.test";
    let text = "";
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      if (url.includes("smtp")) text = JSON.parse(String(init.body)).email.text;
      return new Response(JSON.stringify({ access_token: "tok" }), { status: 200 });
    });
    await approve(t, await ask(t, email));
    await t.finishAllScheduledFunctions(() => {});
    vi.unstubAllGlobals();
    return /token=(eci_[0-9a-f]{64})/.exec(text)![1]!;
  }

  it("says billing is off without a Stripe key, and refuses a bad link", async () => {
    const t = mk();
    const token = await invited(t, ALICE.email);
    await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    expect(await t.withIdentity(ALICE).action(api.access.proCheckout, { token })).toEqual({ state: "billing_off" });
    expect(await t.withIdentity(ALICE).action(api.access.proCheckout, { token: "eci_" + "1".repeat(64) })).toEqual({ state: "invalid" });
  });

  it("with a key: needs sign-in, the approved email, and the billing flag; then creates a Checkout session", async () => {
    const t = mk();
    const token = await invited(t, ALICE.email);
    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_PRICE_CREATOR = "price_creator";
    expect(await t.action(api.access.proCheckout, { token })).toEqual({ state: "sign_in_required" });
    await t.withIdentity(BOB).mutation(api.users.ensure, {});
    expect(await t.withIdentity(BOB).action(api.access.proCheckout, { token })).toEqual({ state: "wrong_account", email: "a•••@example.com" });
    await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    expect(await t.withIdentity(ALICE).action(api.access.proCheckout, { token })).toEqual({ state: "billing_off" });
    await t.mutation(internal.flags.set, { key: "billing", enabled: true });
    const bodies: string[] = [];
    vi.stubGlobal("fetch", async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return new Response(JSON.stringify({ url: "https://checkout.stripe.test/s" }), { status: 200 });
    });
    expect(await t.withIdentity(ALICE).action(api.access.proCheckout, { token })).toEqual({ state: "redirect", url: "https://checkout.stripe.test/s" });
    const form = new URLSearchParams(bodies[0]);
    expect(form.get("line_items[0][price]")).toBe("price_creator");
    expect(form.get("metadata[plan]")).toBe(PRO_PLAN);
    expect(form.get("success_url")).toBe("https://eyecandid.test/pro/checkout?checkout=success");
  });
});

// ───────────── entitlements and GPU jobs ─────────────

async function proUser(t: T, opts: { approved?: boolean; paid?: boolean; credits?: number } = {}) {
  const userId = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
  if (opts.approved !== false) {
    await t.run((ctx) => ctx.db.insert("flags", { key: "pro", enabled: true, rolloutPct: 0, allow: [ALICE.email] }));
  }
  if (opts.paid !== false) {
    await t.mutation(internal.billing.applyStripeEvent, {
      eventId: "evt_checkout",
      type: "checkout.session.completed",
      object: { client_reference_id: userId, metadata: { kind: "plan", plan: PRO_PLAN }, payment_status: "paid", customer: "cus_1", subscription: "sub_1" },
    });
  }
  if (opts.credits !== undefined) {
    // exactly this many: drop the checkout's monthly lot, hold the balance as a migrated (pre-ADR 0014) one
    await t.run(async (ctx) => {
      for (const l of await ctx.db.query("creditLots").withIndex("by_user_lot", (q) => q.eq("userId", userId)).collect()) await ctx.db.delete(l._id);
      const ent = await ctx.db.query("entitlements").withIndex("by_user", (q) => q.eq("userId", userId)).unique();
      await ctx.db.patch(ent!._id, { credits: opts.credits });
    });
  }
  return userId;
}
const credits = (t: T, userId: Id<"users">) => t.run(async (ctx) => balance((await ledgerFor(ctx, userId, Date.now())).lots, Date.now()));
const still = (t: T, ownerUserId?: Id<"users">, key = "still:1") =>
  t.run((ctx) => enqueueJob(ctx, { type: "still", input: { prompt: "a bead", w: 512, h: 512 }, idempotencyKey: key, ownerUserId, ownerAnonId: anon("a") }));
const jobCount = (t: T) => t.run(async (ctx) => (await ctx.db.query("jobs").collect()).length);

describe("entitlements from the Stripe webhook", () => {
  it("checkout grants the plan and this month's credits, once (a renewal in the same month adds nothing)", async () => {
    const t = mk();
    const userId = await proUser(t);
    expect(await credits(t, userId)).toBe(PLANS[PRO_PLAN].monthlyCredits);
    await t.mutation(internal.billing.applyStripeEvent, {
      eventId: "evt_update",
      type: "customer.subscription.updated",
      object: { id: "sub_1", customer: "cus_1", status: "active", metadata: { plan: PRO_PLAN } },
    });
    expect(await credits(t, userId)).toBe(PLANS[PRO_PLAN].monthlyCredits);
    const ent = await t.run((ctx) => ctx.db.query("entitlements").withIndex("by_user", (q) => q.eq("userId", userId)).unique());
    expect(ent).toMatchObject({ plan: PRO_PLAN, subscriptionStatus: "active", watermark: false });
  });

  it("a paid renewal invoice grants the next period's credits; a subscription update alone grants nothing", async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date("2026-11-20T00:00:00Z"));
      const t = mk();
      const userId = await proUser(t, { credits: 3 });
      vi.setSystemTime(new Date("2026-12-20T00:00:00Z"));
      await t.mutation(internal.billing.applyStripeEvent, {
        eventId: "evt_update2",
        type: "customer.subscription.updated",
        object: { id: "sub_1", customer: "cus_1", status: "active", metadata: { plan: PRO_PLAN } },
      });
      expect(await credits(t, userId)).toBe(3);
      const s = Date.UTC(2026, 11, 20) / 1000;
      await t.mutation(internal.billing.applyStripeEvent, {
        eventId: "evt_renew",
        type: "invoice.paid",
        object: { id: "in_2", customer: "cus_1", subscription: "sub_1", billing_reason: "subscription_cycle", amount_paid: 1900, lines: { data: [{ period: { start: s, end: s + 31 * 86400 } }] }, subscription_details: { metadata: { plan: PRO_PLAN } } },
      });
      expect(await credits(t, userId)).toBe(3 + PLANS[PRO_PLAN].monthlyCredits);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("GPU jobs are refused server-side without Pro", () => {
  it("refuses an anonymous caller", async () => {
    const t = mk();
    await expect(still(t)).rejects.toThrow(/pro_required/);
    expect(await jobCount(t)).toBe(0);
  });

  it("refuses a signed-in user who is not approved, even with a paid plan and credits", async () => {
    const t = mk();
    const userId = await proUser(t, { approved: false });
    await expect(still(t, userId)).rejects.toThrow(/pro_required/);
    expect(await credits(t, userId)).toBe(PLANS[PRO_PLAN].monthlyCredits);
    expect(await jobCount(t)).toBe(0);
  });

  it("refuses an approved user who has not paid", async () => {
    const t = mk();
    const userId = await proUser(t, { paid: false });
    await expect(still(t, userId)).rejects.toThrow(/subscription_inactive/);
  });

  it("refuses when the subscription has ended", async () => {
    const t = mk();
    const userId = await proUser(t);
    await t.mutation(internal.billing.applyStripeEvent, { eventId: "evt_del", type: "customer.subscription.deleted", object: { id: "sub_1", customer: "cus_1", status: "canceled" } });
    await expect(still(t, userId)).rejects.toThrow(/subscription_inactive/);
  });

  it("refuses without enough credits, and writes nothing", async () => {
    const t = mk();
    const userId = await proUser(t, { credits: 0 });
    await expect(still(t, userId)).rejects.toThrow(/credits_required/);
    expect(await jobCount(t)).toBe(0);
    expect(await credits(t, userId)).toBe(0);
  });

  it("every non-CPU job type is gated (i2v, t2v, voice, matte, inpaint, grade)", async () => {
    const t = mk();
    const inputs = {
      i2v: { mediaId: "m", prompt: "p", durationMs: 1000 },
      t2v: { prompt: "p", durationMs: 1000, aspect: "9:16" },
      voice: { text: "hi", voiceId: "v", consentId: "c" },
      matte: { mediaId: "m" },
      inpaint: { mediaId: "m", maskMediaId: "k", instruction: "x" },
      grade: { mediaId: "m", look: "warm" },
    } as const;
    for (const [type, input] of Object.entries(inputs)) {
      await expect(t.run((ctx) => enqueueJob(ctx, { type: type as keyof typeof inputs, input, idempotencyKey: type, ownerAnonId: anon("a") }))).rejects.toThrow(/pro_required/);
    }
    // free CPU work is untouched
    await t.run((ctx) => enqueueJob(ctx, { type: "hello", input: { message: "hi" }, idempotencyKey: "h", ownerAnonId: anon("a") }));
    expect(await jobCount(t)).toBe(1);
  });
});

describe("GPU credits: charged on enqueue, refunded on final failure", () => {
  async function worker(t: T) {
    const { token } = await t.mutation(internal.workers.register, { name: "gpu-1", provider: "modal-gpu" });
    const b = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
    const hash = [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
    return (await t.mutation(internal.workers.touch, { tokenHash: hash }))!;
  }

  it("charges once per idempotency key", async () => {
    const t = mk();
    const userId = await proUser(t, { credits: 5 });
    const a = await still(t, userId);
    const b = await still(t, userId);
    expect(a).toBe(b);
    expect(await credits(t, userId)).toBe(4);
    expect(await t.run((ctx) => ctx.db.query("creditCharges").collect())).toMatchObject([{ jobId: a, credits: 1 }]);
  });

  it("a retryable failure keeps the charge; the final failure refunds it, once", async () => {
    const t = mk();
    const userId = await proUser(t, { credits: 1 });
    const workerId = await worker(t);
    const jobId = await still(t, userId);
    await t.run((ctx) => ctx.db.patch(jobId, { maxAttempts: 2 }));
    await t.mutation(internal.jobs.claim, { workerId, types: ["still"] });
    await t.mutation(internal.jobs.fail, { workerId, jobId, error: "oom", retryable: true });
    expect(await credits(t, userId)).toBe(0); // requeued, still charged
    await t.mutation(internal.jobs.claim, { workerId, types: ["still"] });
    await t.mutation(internal.jobs.fail, { workerId, jobId, error: "oom", retryable: true });
    expect((await t.run((ctx) => ctx.db.get(jobId)))!.status).toBe("failed");
    expect(await credits(t, userId)).toBe(1);
    await t.mutation(internal.jobs.fail, { workerId, jobId, error: "again", retryable: false }); // stale: no double refund
    expect(await credits(t, userId)).toBe(1);
  });

  it("deleting the edit refunds a paid job that is still waiting or running, once, and not one that delivered", async () => {
    const t = mk();
    const userId = await proUser(t, { credits: 5 });
    const workerId = await worker(t);
    const projectId = await t.withIdentity(ALICE).mutation(api.projects.create, { anonId: anon("a") });
    const job = (key: string) =>
      t.run((ctx) => enqueueJob(ctx, { type: "still", input: { prompt: "a bead", w: 512, h: 512 }, idempotencyKey: key, projectId, ownerUserId: userId, ownerAnonId: anon("a") }));
    const done = await job("still:done");
    const claimed = await t.mutation(internal.jobs.claim, { workerId, types: ["still"] });
    expect(claimed!.id).toBe(done);
    const storageId = await t.run((ctx) => ctx.storage.store(new Blob(["png"], { type: "image/png" })));
    const mediaId = await t.mutation(internal.media.registerFromWorker, { storageId, contentType: "image/png", kind: "generated" });
    expect((await t.mutation(internal.jobs.complete, { workerId, jobId: done, output: { mediaId } })).ok).toBe(true);
    const running = await job("still:running");
    await t.mutation(internal.jobs.claim, { workerId, types: ["still"] });
    await job("still:queued");
    expect(await credits(t, userId)).toBe(2);

    await t.withIdentity(ALICE).mutation(api.projects.remove, { projectId });
    await t.finishAllScheduledFunctions(() => {});
    expect(await credits(t, userId)).toBe(4); // the two that never delivered; the delivered still stays paid for
    // the worker reporting on the canceled job afterwards changes nothing
    await t.mutation(internal.jobs.fail, { workerId, jobId: running, error: "gone", retryable: false });
    expect(await credits(t, userId)).toBe(4);
  });

  it("refunds when the output fails the contract", async () => {
    const t = mk();
    const userId = await proUser(t, { credits: 1 });
    const workerId = await worker(t);
    const jobId = await still(t, userId);
    await t.mutation(internal.jobs.claim, { workerId, types: ["still"] });
    await t.mutation(internal.jobs.complete, { workerId, jobId, output: { nope: true } });
    expect(await credits(t, userId)).toBe(1);
  });

  it("refunds when the lease expires for the last time", async () => {
    const t = mk();
    const userId = await proUser(t, { credits: 1 });
    const workerId = await worker(t);
    const jobId = await still(t, userId);
    await t.run((ctx) => ctx.db.patch(jobId, { maxAttempts: 1 }));
    await t.mutation(internal.jobs.claim, { workerId, types: ["still"] });
    await t.run((ctx) => ctx.db.patch(jobId, { leaseExpiresAt: Date.now() - 1 }));
    await t.mutation(internal.jobs.requeueExpired, {});
    expect((await t.run((ctx) => ctx.db.get(jobId)))!.status).toBe("failed");
    expect(await credits(t, userId)).toBe(1);
  });

  it("a success keeps the charge", async () => {
    const t = mk();
    const userId = await proUser(t, { credits: 2 });
    const workerId = await worker(t);
    const jobId = await still(t, userId);
    await t.mutation(internal.jobs.claim, { workerId, types: ["still"] });
    expect(await t.mutation(internal.jobs.complete, { workerId, jobId, output: { mediaId: "m_out" } })).toEqual({ ok: true });
    expect(await credits(t, userId)).toBe(1);
  });
});
