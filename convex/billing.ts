import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { CREDIT_PACKS, PLANS, isPlanId } from "@eyelore/core";
import type { PlanId } from "@eyelore/core";
import { flagOn } from "./lib/flags";
import { ensureEntitlement, entitlementFor, setPlan, userByClerkId } from "./lib/users";
import { addMonthUtc, grantPeriodCredits, grantTopup, legacyFirstPeriodPaid } from "./lib/credits";

type StripeObj = Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- Stripe payloads are untyped JSON

export type CheckoutResult =
  | { configured: false; reason?: "disabled" | "price_missing" | "web_url_missing" }
  | { configured: true; ok: false; error: "sign_in_required" | "stripe_error" }
  | { configured: true; ok: true; url: string };

/** Who is asking, and is billing switched on for them. */
export const checkoutContext = internalQuery({
  args: { clerkId: v.string() },
  handler: async (ctx, { clerkId }) => {
    const user = await userByClerkId(ctx, clerkId);
    if (!user) return null;
    const ent = await entitlementFor(ctx, user._id);
    return { userId: user._id, email: user.email, customerId: ent?.stripeCustomerId, enabled: await flagOn(ctx, "billing", user._id) };
  },
});

/**
 * Create a Stripe Checkout session over the REST API (no SDK).
 * Real when STRIPE_SECRET_KEY is set; until then returns `{ configured: false }` and the UI says payments aren't
 * connected yet. Price ids come from env (STRIPE_PRICE_CREATOR, STRIPE_PRICE_STUDIO, STRIPE_PRICE_CREDITS_*).
 */
export const checkout = action({
  args: {
    plan: v.optional(v.union(v.literal("creator"), v.literal("studio"))),
    pack: v.optional(v.union(v.literal("small"), v.literal("large"))),
    /** where to come back to, on our own site only (relative path) */
    returnPath: v.string(),
  },
  handler: async (ctx, a): Promise<CheckoutResult> => {
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return { configured: false };
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return { configured: true, ok: false, error: "sign_in_required" };
    const me = await ctx.runQuery(internal.billing.checkoutContext, { clerkId: identity.subject });
    if (!me) return { configured: true, ok: false, error: "sign_in_required" };
    if (!me.enabled) return { configured: false, reason: "disabled" };
    return await createStripeCheckout(key, me, a);
  },
});

/**
 * The Stripe REST call behind every checkout (here and Pro's `access.proCheckout`). The caller has already checked
 * the key, the signed-in user and the `billing` flag.
 */
export async function createStripeCheckout(
  key: string,
  me: { userId: string; email?: string; customerId?: string },
  a: { plan?: "creator" | "studio"; pack?: "small" | "large"; returnPath: string },
): Promise<CheckoutResult> {
  const base = (process.env.EYELORE_WEB_URL ?? "").replace(/\/$/, "");
  if (!base || !/^\/[A-Za-z0-9/_-]*$/.test(a.returnPath)) return { configured: false, reason: "web_url_missing" };

  const credits = a.pack ? CREDIT_PACKS[a.pack] : undefined;
  const planDef = a.plan ? PLANS[a.plan] : undefined;
  const priceEnv = credits?.priceEnv ?? planDef?.priceEnv;
  const price = priceEnv ? process.env[priceEnv] : undefined;
  if (!price) return { configured: false, reason: "price_missing" };

  const meta: Record<string, string> = { userId: me.userId, ...(credits ? { kind: "credits", pack: a.pack! } : { kind: "plan", plan: a.plan! }) };
  const form = new URLSearchParams({
    mode: credits ? "payment" : "subscription",
    success_url: `${base}${a.returnPath}?checkout=success`,
    cancel_url: `${base}${a.returnPath}?checkout=canceled`,
    client_reference_id: me.userId,
    "line_items[0][price]": price,
    "line_items[0][quantity]": "1",
  });
  for (const [k, val] of Object.entries(meta)) {
    form.set(`metadata[${k}]`, val);
    if (!credits) form.set(`subscription_data[metadata][${k}]`, val);
  }
  if (me.customerId) form.set("customer", me.customerId);
  else if (me.email) form.set("customer_email", me.email);

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/x-www-form-urlencoded" },
    body: form,
  });
  if (!res.ok) return { configured: true, ok: false, error: "stripe_error" };
  const session = (await res.json()) as { url?: string };
  return session.url ? { configured: true, ok: true, url: session.url } : { configured: true, ok: false, error: "stripe_error" };
}

/**
 * The invoice line that is the subscription's own period: not a proration (an upgrade's credit or charge for part of a
 * period comes first on such invoices), and a subscription line where Stripe says so (`type: "subscription"` in older
 * API versions, `parent.type: "subscription_item_details"` in newer ones). Its period and price are the ones to use.
 */
function periodLine(lines: StripeObj[] | undefined): StripeObj | undefined {
  const proration = (l: StripeObj) => l.proration === true || l.parent?.subscription_item_details?.proration === true;
  const subscription = (l: StripeObj) => l.type === "subscription" || l.parent?.type === "subscription_item_details";
  const candidates = (lines ?? []).filter((l) => l?.period && !proration(l));
  return candidates.find(subscription) ?? candidates[0];
}

function planFromPrice(priceId: string | undefined): PlanId | undefined {
  if (!priceId) return undefined;
  if (process.env.STRIPE_PRICE_CREATOR === priceId) return "creator";
  if (process.env.STRIPE_PRICE_STUDIO === priceId) return "studio";
  return undefined;
}

/**
 * Apply one verified Stripe event. Idempotent: the event id is recorded in the same transaction that applies it,
 * so a replay (Stripe retries, or an attacker replaying a captured body inside the tolerance window) changes nothing.
 */
export const applyStripeEvent = internalMutation({
  args: { eventId: v.string(), type: v.string(), object: v.any() },
  handler: async (ctx, { eventId, type, object }) => {
    const seen = await ctx.db.query("stripeEvents").withIndex("by_eventId", (q) => q.eq("eventId", eventId)).unique();
    if (seen) return { applied: false as const, why: "duplicate" };
    await ctx.db.insert("stripeEvents", { eventId, at: Date.now(), type });
    const o = object as StripeObj;

    if (type === "checkout.session.completed") {
      const userId = ctx.db.normalizeId("users", String(o.client_reference_id ?? o.metadata?.userId ?? ""));
      if (!userId || !(await ctx.db.get(userId))) return { applied: false as const, why: "unknown user" };
      if (o.metadata?.kind === "credits") {
        const pack = CREDIT_PACKS[o.metadata?.pack as keyof typeof CREDIT_PACKS];
        if (!pack || o.payment_status !== "paid") return { applied: false as const, why: "not a paid credit pack" };
        const ent = await ensureEntitlement(ctx, userId);
        if (o.customer && o.customer !== ent.stripeCustomerId) await ctx.db.patch(ent._id, { stripeCustomerId: o.customer });
        // a top-up is its own lot, good for 12 months (ADR 0014); one per checkout session, whatever replays
        await grantTopup(ctx, userId, `t:${String(o.id ?? eventId)}`, pack.credits);
        return { applied: true as const };
      }
      const plan = o.metadata?.plan;
      if (!isPlanId(plan) || plan === "free" || o.payment_status === "unpaid") return { applied: false as const, why: "no paid plan" };
      const sub = String(o.subscription ?? o.id ?? eventId);
      // read before setPlan records this subscription: was its first period paid out by the code before ADR 0014?
      const paidBefore = legacyFirstPeriodPaid(await entitlementFor(ctx, userId), sub, Date.now());
      await setPlan(ctx, userId, plan, { stripeCustomerId: o.customer ?? undefined, stripeSubscriptionId: o.subscription ?? undefined, subscriptionStatus: "active" });
      // the first period is paid: its credits, until the period ends. The session doesn't carry the period, so a month
      // from now stands in until the first invoice.paid (same lot id) corrects the end. A trial ("no_payment_required")
      // gets none until something is paid.
      if (o.payment_status === "paid") await grantPeriodCredits(ctx, userId, plan, `p:${sub}:first`, addMonthUtc(Date.now()), Date.now(), paidBefore);
      return { applied: true as const };
    }

    if (type === "customer.subscription.updated" || type === "customer.subscription.deleted") {
      let ent = o.customer ? await ctx.db.query("entitlements").withIndex("by_stripeCustomer", (q) => q.eq("stripeCustomerId", o.customer)).unique() : null;
      if (!ent) {
        const userId = ctx.db.normalizeId("users", String(o.metadata?.userId ?? ""));
        if (userId && (await ctx.db.get(userId))) ent = await ensureEntitlement(ctx, userId);
      }
      if (!ent) return { applied: false as const, why: "unknown customer" };
      const status = String(o.status ?? "");
      const ended = type === "customer.subscription.deleted" || ["canceled", "unpaid", "incomplete_expired"].includes(status);
      if (ended) {
        await setPlan(ctx, ent.userId, "free", { subscriptionStatus: status || "canceled", stripeSubscriptionId: undefined, stripeCustomerId: o.customer ?? ent.stripeCustomerId });
        return { applied: true as const };
      }
      if (["active", "trialing", "past_due"].includes(status)) {
        const plan = planFromPrice(o.items?.data?.[0]?.price?.id) ?? (isPlanId(o.metadata?.plan) ? (o.metadata.plan as PlanId) : undefined);
        if (plan) await setPlan(ctx, ent.userId, plan, { subscriptionStatus: status, stripeSubscriptionId: o.id ?? ent.stripeSubscriptionId, stripeCustomerId: o.customer ?? ent.stripeCustomerId });
        // no credits here: an update is not a payment. Each paid period's credits come with its invoice.paid.
        return { applied: !!plan };
      }
      return { applied: false as const, why: `status ${status}` };
    }

    // A paid billing period (ADR 0014): its credits as one lot that ends with the period. Keyed by the period, so
    // a replay, or the first invoice after checkout already granted the first period, adds nothing. Only a new
    // subscription's first invoice and a renewal grant: a mid-period plan change (`subscription_update`, a proration)
    // grants nothing, and the new plan's credits start with its next renewal.
    if (type === "invoice.paid") {
      const sub = o.subscription ?? o.parent?.subscription_details?.subscription;
      if (!sub) return { applied: false as const, why: "not a subscription invoice" };
      if (o.billing_reason !== "subscription_create" && o.billing_reason !== "subscription_cycle") return { applied: false as const, why: `billing reason ${String(o.billing_reason)}` };
      if (!(Number(o.amount_paid) > 0)) return { applied: false as const, why: "nothing paid" };
      const meta = o.subscription_details?.metadata ?? o.parent?.subscription_details?.metadata ?? {};
      let ent = o.customer ? await ctx.db.query("entitlements").withIndex("by_stripeCustomer", (q) => q.eq("stripeCustomerId", o.customer)).unique() : null;
      if (!ent) {
        const userId = ctx.db.normalizeId("users", String(meta.userId ?? ""));
        if (userId && (await ctx.db.get(userId))) ent = await ensureEntitlement(ctx, userId);
      }
      if (!ent) return { applied: false as const, why: "unknown customer" };
      const line = periodLine(o.lines?.data);
      if (!line) return { applied: false as const, why: "no subscription line" };
      const plan =
        planFromPrice(line?.price?.id ?? line?.pricing?.price_details?.price) ?? (isPlanId(meta.plan) ? (meta.plan as PlanId) : isPlanId(ent.plan) ? ent.plan : undefined);
      if (!plan || plan === "free") return { applied: false as const, why: "no paid plan" };
      const start = Number(line.period?.start);
      const end = Number(line.period?.end) * 1000;
      if (!Number.isFinite(start) || !Number.isFinite(end)) return { applied: false as const, why: "no period" };
      const lotId = o.billing_reason === "subscription_create" ? `p:${String(sub)}:first` : `p:${String(sub)}:${start}`;
      await grantPeriodCredits(ctx, ent.userId, plan, lotId, end, Date.now(), o.billing_reason === "subscription_create" && legacyFirstPeriodPaid(ent, String(sub), Date.now()));
      return { applied: true as const };
    }
    return { applied: false as const, why: "ignored type" };
  },
});
