import { convexTest } from "convex-test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { emptyEditDoc } from "@eyelore/core";
import schema from "./schema";
import { api, internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { signStripe, signSvix } from "./lib/webhookSig";

const modules = import.meta.glob("./**/*.ts");
const ANON = "anon_" + "a".repeat(32);
const ANON2 = "anon_" + "b".repeat(32);
const ALICE = { subject: "user_alice", email: "alice@example.com" };
const BOB = { subject: "user_bob", email: "bob@example.com" };

type T = ReturnType<typeof convexTest>;
const mk = () => convexTest(schema, modules);

/** A project whose edit is one bead of `durationMs` (enough for the export rules; no pipeline needed). */
async function seed(t: T, owner: { anonId: string; as?: typeof ALICE }, durationMs = 30_000) {
  const caller = owner.as ? t.withIdentity(owner.as) : t;
  const projectId = await caller.mutation(api.projects.create, { anonId: owner.anonId });
  await t.run(async (ctx) => {
    const row = await ctx.db.query("editDocs").withIndex("by_project", (q) => q.eq("projectId", projectId)).unique();
    const doc = emptyEditDoc(projectId);
    doc.clips = [{ id: "c1", mediaId: "m1", source: "upload", w: 640, h: 360, durationMs, fps: 30 }];
    doc.beads = [{ id: "b1", clipId: "c1", inMs: 0, outMs: durationMs, words: [], cuts: [], struck: false }] as typeof doc.beads;
    await ctx.db.patch(row!._id, { doc });
    await ctx.db.patch(projectId, { stage: "ready" });
  });
  return projectId;
}
const renderInput = async (t: T, jobId: Id<"jobs">) => (await t.run((ctx) => ctx.db.get(jobId)))!.input as { watermark: boolean; maxDurationMs: number };
const exp = (t: T, projectId: Id<"projects">, extra: object = {}, as?: typeof ALICE) =>
  (as ? t.withIdentity(as) : t).mutation(api.pipeline.startExport, { anonId: ANON, projectId, aspect: "9:16", requestId: Math.random().toString(36), ...extra } as never);

async function setPaid(t: T, userId: Id<"users">, plan: "creator" | "studio") {
  const { setPlan } = await import("./lib/users");
  await t.run((ctx) => setPlan(ctx, userId, plan));
}

describe("account claim", () => {
  it("moves the anonymous projects to the signed-in user", async () => {
    const t = mk();
    const p1 = await seed(t, { anonId: ANON });
    const p2 = await seed(t, { anonId: ANON });
    const r = await t.withIdentity(ALICE).mutation(api.account.claim, { anonId: ANON });
    expect(r).toEqual({ moved: 2, alreadyYours: 0, skipped: 0 });
    const rows = await t.run(async (ctx) => [await ctx.db.get(p1), await ctx.db.get(p2)]);
    const user = await t.run((ctx) => ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", "user_alice")).unique());
    expect(rows.every((p) => p!.ownerUserId === user!._id)).toBe(true);
  });

  it("is idempotent", async () => {
    const t = mk();
    await seed(t, { anonId: ANON });
    const a = t.withIdentity(ALICE);
    await a.mutation(api.account.claim, { anonId: ANON });
    expect(await a.mutation(api.account.claim, { anonId: ANON })).toEqual({ moved: 0, alreadyYours: 1, skipped: 0 });
    expect(await t.run((ctx) => ctx.db.query("accountClaims").collect())).toHaveLength(1); // only the call that moved something is logged
  });

  it("cannot steal a project that already belongs to another user", async () => {
    const t = mk();
    const p = await seed(t, { anonId: ANON });
    await t.withIdentity(ALICE).mutation(api.account.claim, { anonId: ANON });
    const r = await t.withIdentity(BOB).mutation(api.account.claim, { anonId: ANON });
    expect(r).toEqual({ moved: 0, alreadyYours: 0, skipped: 1 });
    const alice = await t.run((ctx) => ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", "user_alice")).unique());
    expect((await t.run((ctx) => ctx.db.get(p)))!.ownerUserId).toBe(alice!._id);
    // and Bob cannot read it with the anon id either way round: reading goes through the owner check
    expect(await t.withIdentity(BOB).query(api.projects.get, { projectId: p })).toBeNull();
  });

  it("only moves projects of the anon id presented", async () => {
    const t = mk();
    const mine = await seed(t, { anonId: ANON });
    const other = await seed(t, { anonId: ANON2 });
    await t.withIdentity(ALICE).mutation(api.account.claim, { anonId: ANON });
    expect((await t.run((ctx) => ctx.db.get(other)))!.ownerUserId).toBeUndefined();
    expect((await t.run((ctx) => ctx.db.get(mine)))!.ownerUserId).toBeDefined();
  });

  it("rejects unauthenticated callers and malformed anon ids", async () => {
    const t = mk();
    const p = await seed(t, { anonId: ANON });
    await expect(t.mutation(api.account.claim, { anonId: ANON })).rejects.toThrow(/not signed in/);
    await expect(t.withIdentity(ALICE).mutation(api.account.claim, { anonId: "anon_short" })).rejects.toThrow(/bad anon id/);
    expect((await t.run((ctx) => ctx.db.get(p)))!.ownerUserId).toBeUndefined();
  });

  it("after the claim the user reads the project without the anon id", async () => {
    const t = mk();
    const p = await seed(t, { anonId: ANON });
    expect(await t.withIdentity(ALICE).query(api.projects.get, { projectId: p })).toBeNull(); // before: no
    await t.withIdentity(ALICE).mutation(api.account.claim, { anonId: ANON });
    const view = await t.withIdentity(ALICE).query(api.projects.get, { projectId: p });
    expect(view?.project._id).toBe(p);
  });

  it("users.ensure upserts from the JWT identity and requires sign-in", async () => {
    const t = mk();
    await expect(t.mutation(api.users.ensure, {})).rejects.toThrow(/not signed in/);
    const id = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    expect(await t.withIdentity(ALICE).mutation(api.users.ensure, {})).toBe(id);
    const u = await t.run((ctx) => ctx.db.get(id));
    expect(u).toMatchObject({ clerkId: "user_alice", email: "alice@example.com", plan: "free" });
    expect(await t.run((ctx) => ctx.db.query("entitlements").collect())).toHaveLength(1);
  });
});

describe("export entitlements (server-side), billing on and Stripe configured", () => {
  const saved = process.env.STRIPE_SECRET_KEY;
  beforeEach(() => {
    process.env.STRIPE_SECRET_KEY = "sk_test_enforce";
  });
  afterEach(() => {
    if (saved === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = saved;
  });
  const enforced = async () => {
    const t = mk();
    await t.mutation(internal.flags.set, { key: "billing", enabled: true });
    return t;
  };

  it("anonymous: watermarked, capped at 60s; a long edit needs a paid plan or the free choice", async () => {
    const t = await enforced();
    const short = await seed(t, { anonId: ANON }, 30_000);
    expect(await renderInput(t, await exp(t, short))).toMatchObject({ watermark: true, maxDurationMs: 60_000 });

    const long = await seed(t, { anonId: ANON }, 150_000);
    await expect(exp(t, long)).rejects.toMatchObject({ data: { code: "paid_required", reason: "length_cap", freeAvailable: true } });
    const free = await renderInput(t, await exp(t, long, { mode: "free" }));
    expect(free).toMatchObject({ watermark: true, maxDurationMs: 60_000 });
  });

  it("no argument can lift the watermark or the cap", async () => {
    const t = await enforced();
    const long = await seed(t, { anonId: ANON }, 150_000);
    await expect(exp(t, long, { watermark: false })).rejects.toThrow(); // unknown argument
    await expect(exp(t, long, { plan: "studio" })).rejects.toThrow();
    await expect(exp(t, long, { maxDurationMs: 600_000 })).rejects.toThrow(); // only 15/30/60s are valid
    await expect(exp(t, long, { mode: "studio" })).rejects.toThrow();
    // a free signed-in user is no different
    await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    await expect(exp(t, long, {}, ALICE)).rejects.toMatchObject({ data: { code: "paid_required" } });
    expect(await renderInput(t, await exp(t, long, { mode: "free" }, ALICE))).toMatchObject({ watermark: true, maxDurationMs: 60_000 });
  });

  it("a signed-out holder of a claimed project's anon id does not inherit the owner's paid plan", async () => {
    const t = await enforced();
    const p = await seed(t, { anonId: ANON }, 150_000);
    const uid = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    await t.withIdentity(ALICE).mutation(api.account.claim, { anonId: ANON });
    await setPaid(t, uid, "creator");
    await expect(exp(t, p)).rejects.toMatchObject({ data: { code: "paid_required" } }); // signed out
    expect(await renderInput(t, await exp(t, p, {}, ALICE))).toMatchObject({ watermark: false, maxDurationMs: 300_000 }); // signed in: paid, creator cap
  });

  it("paid: no watermark and the plan's cap; choosing free still watermarks", async () => {
    const t = await enforced();
    const uid = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    await setPaid(t, uid, "creator");
    const p = await seed(t, { anonId: ANON, as: ALICE }, 150_000);
    const ent = await t.withIdentity(ALICE).query(api.entitlements.mine, {});
    expect(ent).toMatchObject({ plan: "creator", watermark: false, signedIn: true });
    const best = await t.withIdentity(ALICE).mutation(api.pipeline.startExport, { anonId: ANON, projectId: p, aspect: "9:16", requestId: "x" });
    expect(await t.run((ctx) => ctx.db.get(best))).toMatchObject({ input: { watermark: false } });
    const free = await exp(t, p, { mode: "free" }, ALICE);
    expect(await renderInput(t, free)).toMatchObject({ watermark: true, maxDurationMs: 60_000 });
  });

  it("counts minutes once when a render succeeds, and blocks at the monthly allowance", async () => {
    const t = await enforced();
    const p = await seed(t, { anonId: ANON }, 30_000);
    const jobId = await exp(t, p);
    const succeed = (ms: number) =>
      t.run((ctx) => ctx.db.patch(jobId, { status: "succeeded", output: { durationMs: ms } }));
    await succeed(11 * 60_000); // pretend a long render finished: beyond the 10 free minutes
    await t.mutation(internal.entitlements.recordExportDone, { jobId });
    await t.mutation(internal.entitlements.recordExportDone, { jobId }); // replay: counted once
    expect((await t.query(api.entitlements.mine, { anonId: ANON })).minutesUsed).toBe(11);
    await expect(exp(t, p)).rejects.toMatchObject({ data: { code: "paid_required", reason: "minutes", freeAvailable: false } });
    await expect(exp(t, p, { mode: "free" })).rejects.toMatchObject({ data: { reason: "minutes" } });
    // a different anonymous session has its own allowance
    const p2 = await seed(t, { anonId: ANON2 }, 30_000);
    await expect(t.mutation(api.pipeline.startExport, { anonId: ANON2, projectId: p2, aspect: "9:16", requestId: "y" })).resolves.toBeTruthy();
  });

  it("a user's minutes reset in a new month", async () => {
    const t = await enforced();
    const uid = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    await t.run(async (ctx) => {
      const e = await ctx.db.query("entitlements").withIndex("by_user", (q) => q.eq("userId", uid)).unique();
      await ctx.db.patch(e!._id, { minutesUsed: 99, period: "2020-01" });
    });
    expect((await t.withIdentity(ALICE).query(api.entitlements.mine, {})).minutesUsed).toBe(0);
  });
});

describe("export entitlements while payments are not connected (billing off or no Stripe key)", () => {
  const saved = process.env.STRIPE_SECRET_KEY;
  afterEach(() => {
    if (saved === undefined) delete process.env.STRIPE_SECRET_KEY;
    else process.env.STRIPE_SECRET_KEY = saved;
  });

  it("billing flag off: a 90s edit exports clamped to 60s and watermarked, with no error (mobile path, no mode)", async () => {
    process.env.STRIPE_SECRET_KEY = "sk_test_x"; // key alone is not enough
    const t = mk();
    const p = await seed(t, { anonId: ANON }, 90_000);
    expect(await renderInput(t, await exp(t, p))).toMatchObject({ watermark: true, maxDurationMs: 60_000 });
  });

  it("no Stripe key: the flag alone does not turn the paywall on", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const t = mk();
    await t.mutation(internal.flags.set, { key: "billing", enabled: true });
    const p = await seed(t, { anonId: ANON }, 90_000);
    expect(await renderInput(t, await exp(t, p))).toMatchObject({ watermark: true, maxDurationMs: 60_000 });
  });

  it("an anon past the monthly allowance can still export, and usage is still recorded", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const t = mk();
    const p = await seed(t, { anonId: ANON }, 30_000);
    const jobId = await exp(t, p);
    await t.run((ctx) => ctx.db.patch(jobId, { status: "succeeded", output: { durationMs: 11 * 60_000 } }));
    await t.mutation(internal.entitlements.recordExportDone, { jobId });
    expect((await t.query(api.entitlements.mine, { anonId: ANON })).minutesUsed).toBe(11);
    expect(await renderInput(t, await exp(t, p))).toMatchObject({ watermark: true });
  });

  it("still no argument can lift the watermark or the cap", async () => {
    delete process.env.STRIPE_SECRET_KEY;
    const t = mk();
    const p = await seed(t, { anonId: ANON }, 150_000);
    await expect(exp(t, p, { watermark: false })).rejects.toThrow();
    await expect(exp(t, p, { maxDurationMs: 600_000 })).rejects.toThrow();
    await expect(exp(t, p, { mode: "studio" })).rejects.toThrow();
    expect(await renderInput(t, await exp(t, p))).toMatchObject({ watermark: true, maxDurationMs: 60_000 });
  });
});

describe("billing", () => {
  const env = { ...process.env };
  const SECRET = "whsec_stripe_test";
  beforeEach(() => {
    process.env.STRIPE_WEBHOOK_SECRET = SECRET;
  });
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  const post = async (t: T, body: string, sig: string | null) =>
    t.fetch("/stripe/webhook", { method: "POST", body, headers: sig ? { "stripe-signature": sig } : {} });
  const now = () => Math.floor(Date.now() / 1000);
  const evt = (id: string, type: string, object: object) => JSON.stringify({ id, type, data: { object } });

  it("answers 501 until STRIPE_WEBHOOK_SECRET is set", async () => {
    delete process.env.STRIPE_WEBHOOK_SECRET;
    const t = mk();
    const res = await post(t, "{}", null);
    expect(res.status).toBe(501);
  });

  it("accepts a valid signature and upgrades the user", async () => {
    const t = mk();
    const uid = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    const body = evt("evt_1", "checkout.session.completed", { client_reference_id: uid, customer: "cus_1", subscription: "sub_1", payment_status: "paid", metadata: { kind: "plan", plan: "studio", userId: uid } });
    const res = await post(t, body, await signStripe(SECRET, now(), body));
    expect(res.status).toBe(200);
    expect(await t.withIdentity(ALICE).query(api.entitlements.mine, {})).toMatchObject({ plan: "studio", watermark: false });
    const u = await t.run((ctx) => ctx.db.get(uid));
    expect(u!.plan).toBe("studio");
  });

  it("rejects a bad signature, a tampered body and a stale timestamp, and changes nothing", async () => {
    const t = mk();
    const uid = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    const body = evt("evt_2", "checkout.session.completed", { client_reference_id: uid, payment_status: "paid", metadata: { kind: "plan", plan: "creator" } });
    expect((await post(t, body, `t=${now()},v1=${"0".repeat(64)}`)).status).toBe(400);
    expect((await post(t, body + " ", await signStripe(SECRET, now(), body))).status).toBe(400);
    expect((await post(t, body, await signStripe(SECRET, now() - 600, body))).status).toBe(400);
    expect((await post(t, body, await signStripe("whsec_wrong", now(), body))).status).toBe(400);
    expect((await post(t, body, null)).status).toBe(400);
    expect((await t.withIdentity(ALICE).query(api.entitlements.mine, {})).plan).toBe("free");
    expect(await t.run((ctx) => ctx.db.query("stripeEvents").collect())).toHaveLength(0);
  });

  it("applies a replayed event once", async () => {
    const t = mk();
    const uid = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    const body = evt("evt_3", "checkout.session.completed", { client_reference_id: uid, customer: "cus_3", payment_status: "paid", metadata: { kind: "credits", pack: "small" } });
    for (let i = 0; i < 3; i++) expect((await post(t, body, await signStripe(SECRET, now(), body))).status).toBe(200);
    // a pack is one top-up lot (12 months), whatever the replays (ADR 0014)
    const lots = await t.run((ctx) => ctx.db.query("creditLots").collect());
    expect(lots).toHaveLength(1);
    expect(lots[0]).toMatchObject({ userId: uid, kind: "topup", remaining: 100 }); // not 300
    expect(await t.run((ctx) => ctx.db.query("stripeEvents").collect())).toHaveLength(1);
  });

  it("subscription updated/deleted move the plan, found by customer id", async () => {
    const t = mk();
    process.env.STRIPE_PRICE_CREATOR = "price_creator";
    process.env.STRIPE_PRICE_STUDIO = "price_studio";
    const uid = await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    const send = async (id: string, type: string, o: object) => {
      const body = evt(id, type, o);
      expect((await post(t, body, await signStripe(SECRET, now(), body))).status).toBe(200);
    };
    await send("e1", "checkout.session.completed", { client_reference_id: uid, customer: "cus_9", subscription: "sub_9", payment_status: "paid", metadata: { kind: "plan", plan: "creator" } });
    const plan = async () => (await t.withIdentity(ALICE).query(api.entitlements.mine, {})).plan;
    expect(await plan()).toBe("creator");
    await send("e2", "customer.subscription.updated", { id: "sub_9", customer: "cus_9", status: "active", items: { data: [{ price: { id: "price_studio" } }] } });
    expect(await plan()).toBe("studio");
    await send("e3", "customer.subscription.deleted", { id: "sub_9", customer: "cus_9", status: "canceled" });
    expect(await plan()).toBe("free");
  });

  it("checkout returns { configured: false } without STRIPE_SECRET_KEY, and is real with it", async () => {
    const t = mk();
    delete process.env.STRIPE_SECRET_KEY;
    expect(await t.withIdentity(ALICE).action(api.billing.checkout, { plan: "creator", returnPath: "/edit/x" })).toEqual({ configured: false });

    process.env.STRIPE_SECRET_KEY = "sk_test_x";
    process.env.STRIPE_PRICE_CREATOR = "price_creator";
    process.env.EYELORE_WEB_URL = "https://eyelore.test";
    await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    await t.run((ctx) => ctx.db.insert("flags", { key: "billing", enabled: true, rolloutPct: 100, allow: [] }));
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ url: "https://checkout.stripe.test/s/1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const r = await t.withIdentity(ALICE).action(api.billing.checkout, { plan: "creator", returnPath: "/edit/x" });
    expect(r).toEqual({ configured: true, ok: true, url: "https://checkout.stripe.test/s/1" });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.stripe.com/v1/checkout/sessions");
    expect((init.headers as Record<string, string>).authorization).toBe("Bearer sk_test_x");
    const form = new URLSearchParams(String(init.body));
    expect(form.get("line_items[0][price]")).toBe("price_creator");
    expect(form.get("customer_email")).toBe("alice@example.com");
    expect(form.get("success_url")).toBe("https://eyelore.test/edit/x?checkout=success");
    // signed out, and off-site return paths, are refused
    expect(await t.action(api.billing.checkout, { plan: "creator", returnPath: "/edit/x" })).toMatchObject({ ok: false, error: "sign_in_required" });
    expect(await t.withIdentity(ALICE).action(api.billing.checkout, { plan: "creator", returnPath: "//evil.test" })).toMatchObject({ configured: false });
  });
});

describe("Clerk webhook", () => {
  const env = { ...process.env };
  const SECRET = "whsec_" + btoa("clerk-secret-bytes-0123456789abcd");
  afterEach(() => {
    process.env = { ...env };
  });
  const send = async (t: T, payload: object, ts = Math.floor(Date.now() / 1000), sigOverride?: string) => {
    const body = JSON.stringify(payload);
    const id = "msg_" + Math.random().toString(36).slice(2);
    return t.fetch("/clerk/webhook", {
      method: "POST",
      body,
      headers: { "svix-id": id, "svix-timestamp": String(ts), "svix-signature": sigOverride ?? (await signSvix(SECRET, id, ts, body)) },
    });
  };

  it("501 when not configured", async () => {
    delete process.env.CLERK_WEBHOOK_SECRET;
    expect((await send(mk(), { type: "user.created", data: { id: "u" } })).status).toBe(501);
  });

  it("creates, updates and deletes users from signed events; rejects bad signatures", async () => {
    process.env.CLERK_WEBHOOK_SECRET = SECRET;
    const t = mk();
    const data = { id: "user_w", primary_email_address_id: "e2", email_addresses: [{ id: "e1", email_address: "old@x.com" }, { id: "e2", email_address: "w@x.com" }] };
    expect((await send(t, { type: "user.created", data })).status).toBe(200);
    const get = () => t.run((ctx) => ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", "user_w")).unique());
    expect(await get()).toMatchObject({ email: "w@x.com", plan: "free" });
    expect((await send(t, { type: "user.updated", data: { ...data, primary_email_address_id: "e1" } })).status).toBe(200);
    expect((await get())!.email).toBe("old@x.com");
    expect((await send(t, { type: "user.created", data: { id: "user_evil" } }, undefined, "v1,AAAA")).status).toBe(400);
    expect((await send(t, { type: "user.created", data: { id: "user_evil" } }, Math.floor(Date.now() / 1000) - 3600)).status).toBe(400);
    expect(await t.run((ctx) => ctx.db.query("users").withIndex("by_clerkId", (q) => q.eq("clerkId", "user_evil")).unique())).toBeNull();
    expect((await send(t, { type: "user.deleted", data: { id: "user_w" } })).status).toBe(200);
    expect(await get()).toMatchObject({ plan: "free" });
    expect((await get())!.email).toBeUndefined();
    expect((await get())!.deletedAt).toBeTypeOf("number");
  });
});

describe("your edit is ready (SendPulse)", () => {
  const env = { ...process.env };
  afterEach(() => {
    process.env = { ...env };
    vi.unstubAllGlobals();
  });

  async function finishedExport(t: T, opts: { owner?: typeof ALICE; flag?: boolean } = {}) {
    const owner = opts.owner === undefined ? ALICE : opts.owner;
    const p = await seed(t, owner ? { anonId: ANON, as: owner } : { anonId: ANON }, 20_000);
    if (opts.flag !== false) await t.mutation(internal.flags.set, { key: "ready_email", enabled: true });
    const jobId = await (owner ? t.withIdentity(owner) : t).mutation(api.pipeline.startExport, { anonId: ANON, projectId: p, aspect: "9:16", requestId: "r" });
    await t.run((ctx) => ctx.db.patch(jobId, { status: "succeeded", output: { durationMs: 20_000 } }));
    return { p, jobId };
  }
  const notifications = (t: T) => t.run((ctx) => ctx.db.query("notifications").collect());
  const run = async (t: T, jobId: Id<"jobs">) => {
    await t.mutation(internal.notify.onExportDone, { jobId });
    await t.finishAllScheduledFunctions(() => {});
  };

  it("not configured: records 'not sent · SendPulse not configured'", async () => {
    delete process.env.SENDPULSE_CLIENT_ID;
    delete process.env.SENDPULSE_CLIENT_SECRET;
    const t = mk();
    await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    const { jobId } = await finishedExport(t);
    await run(t, jobId);
    expect(await notifications(t)).toMatchObject([{ status: "not_sent", detail: "not sent · SendPulse not configured" }]);
  });

  it("configured: gets a token, then sends the email (mocked fetch)", async () => {
    process.env.SENDPULSE_CLIENT_ID = "id";
    process.env.SENDPULSE_CLIENT_SECRET = "secret";
    process.env.SENDPULSE_FROM_EMAIL = "hello@eyelore.test";
    process.env.EYELORE_WEB_URL = "https://eyelore.test";
    const calls: { url: string; init: RequestInit }[] = [];
    vi.stubGlobal("fetch", async (url: string, init: RequestInit) => {
      calls.push({ url, init });
      return new Response(JSON.stringify(url.includes("oauth") ? { access_token: "tok" } : { result: true }), { status: 200 });
    });
    const t = mk();
    await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    const { jobId, p } = await finishedExport(t);
    await run(t, jobId);
    expect(calls.map((c) => c.url)).toEqual(["https://api.sendpulse.com/oauth/access_token", "https://api.sendpulse.com/smtp/emails"]);
    expect(JSON.parse(String(calls[0]!.init.body))).toEqual({ grant_type: "client_credentials", client_id: "id", client_secret: "secret" });
    expect((calls[1]!.init.headers as Record<string, string>).authorization).toBe("Bearer tok");
    const mail = JSON.parse(String(calls[1]!.init.body)).email;
    expect(mail.to).toEqual([{ email: "alice@example.com" }]);
    expect(mail.subject).toBe("Your edit is ready");
    expect(atob(mail.html)).toContain(`https://eyelore.test/edit/${p}`);
    expect(await notifications(t)).toMatchObject([{ status: "sent" }]);
  });

  it("records a failure honestly when SendPulse errors", async () => {
    process.env.SENDPULSE_CLIENT_ID = "id";
    process.env.SENDPULSE_CLIENT_SECRET = "secret";
    process.env.SENDPULSE_FROM_EMAIL = "hello@eyelore.test";
    vi.stubGlobal("fetch", async () => new Response("no", { status: 401 }));
    const t = mk();
    await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    const { jobId } = await finishedExport(t);
    await run(t, jobId);
    expect(await notifications(t)).toMatchObject([{ status: "failed", detail: "sendpulse auth 401" }]);
  });

  it("skips when the owner is watching (recent editor heartbeat), anonymous, or the flag is off; one per export", async () => {
    const t = mk();
    await t.withIdentity(ALICE).mutation(api.users.ensure, {});
    const watched = await finishedExport(t);
    await t.withIdentity(ALICE).mutation(api.presence.beat, { anonId: ANON, projectId: watched.p });
    await run(t, watched.jobId);
    expect(await notifications(t)).toHaveLength(0);
    // the heartbeat goes stale: away
    await t.run(async (ctx) => {
      const row = await ctx.db.query("presence").withIndex("by_project", (q) => q.eq("projectId", watched.p)).unique();
      await ctx.db.patch(row!._id, { lastSeenAt: Date.now() - 60_000 });
    });
    await run(t, watched.jobId);
    await run(t, watched.jobId); // duplicate trigger
    expect(await notifications(t)).toHaveLength(1);

    const t2 = mk();
    const anon = await finishedExport(t2, { owner: null as never });
    await run(t2, anon.jobId);
    expect(await notifications(t2)).toHaveLength(0);

    const t3 = mk();
    await t3.withIdentity(ALICE).mutation(api.users.ensure, {});
    const off = await finishedExport(t3, { flag: false });
    await run(t3, off.jobId);
    expect(await notifications(t3)).toHaveLength(0);
  });
});
