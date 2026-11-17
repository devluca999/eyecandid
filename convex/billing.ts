import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalMutation, internalQuery } from "./_generated/server";
import { CREDIT_PACKS, PLANS, isPlanId } from "@eyelore/core";
import type { PlanId } from "@eyelore/core";
import { flagOn } from "./lib/flags";
import { ensureEntitlement, entitlementFor, grantMonthlyCredits, setPlan, userByClerkId } from "./lib/users";

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
        await ctx.db.patch(ent._id, { credits: ent.credits + pack.credits, stripeCustomerId: o.customer ?? ent.stripeCustomerId });
        return { applied: true as const };
      }
      const plan = o.metadata?.plan;
      if (!isPlanId(plan) || plan === "free" || o.payment_status === "unpaid") return { applied: false as const, why: "no paid plan" };
      await setPlan(ctx, userId, plan, { stripeCustomerId: o.customer ?? undefined, stripeSubscriptionId: o.subscription ?? undefined, subscriptionStatus: "active" });
      await grantMonthlyCredits(ctx, userId, plan);
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
        // a renewal arrives as an update to a live subscription: this month's credits, once (past_due gets none)
        if (plan && status !== "past_due") await grantMonthlyCredits(ctx, ent.userId, plan);
        return { applied: !!plan };
      }
      return { applied: false as const, why: `status ${status}` };
    }
    return { applied: false as const, why: "ignored type" };
  },
});
