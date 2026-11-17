/**
 * Plans and export entitlements, as data (ADR 0009).
 *
 * !!! PLACEHOLDERS !!!  Every number, name and price below is a placeholder awaiting the owner's decision
 * (PLAN.md "Open questions"). They live only in this file. Prices are NOT here at all: Stripe is the source of
 * truth for money, and the Stripe price ids come from env vars (never hardcoded, never committed).
 */
export const PLANS_ARE_PLACEHOLDERS = true;

export type PlanId = "free" | "creator" | "studio";

export interface PlanDef {
  id: PlanId;
  /** PLACEHOLDER display name */
  label: string;
  /** exports carry the Eyelore watermark */
  watermark: boolean;
  /** longest single export, ms (PLACEHOLDER) */
  exportCapMs: number;
  /** rendered minutes per calendar month, UTC (PLACEHOLDER) */
  monthlyMinutes: number;
  /** Convex env var holding the Stripe price id for this plan; absent for free */
  priceEnv?: "STRIPE_PRICE_CREATOR" | "STRIPE_PRICE_STUDIO";
  /** one honest line for the paywall */
  blurb: string;
}

export const PLANS: Record<PlanId, PlanDef> = {
  free: { id: "free", label: "Free", watermark: true, exportCapMs: 60_000, monthlyMinutes: 10, blurb: "watermarked, up to 60s" },
  creator: { id: "creator", label: "Creator", watermark: false, exportCapMs: 5 * 60_000, monthlyMinutes: 120, priceEnv: "STRIPE_PRICE_CREATOR", blurb: "no watermark, up to 5 min" },
  studio: { id: "studio", label: "Studio", watermark: false, exportCapMs: 15 * 60_000, monthlyMinutes: 600, priceEnv: "STRIPE_PRICE_STUDIO", blurb: "no watermark, up to 15 min, more minutes" },
};

/** Credit packs (for Phase 3 generation). PLACEHOLDER sizes; price id env var per pack. */
export const CREDIT_PACKS = {
  small: { credits: 100, priceEnv: "STRIPE_PRICE_CREDITS_SMALL" },
  large: { credits: 500, priceEnv: "STRIPE_PRICE_CREDITS_LARGE" },
} as const;
export type CreditPackId = keyof typeof CREDIT_PACKS;

export const FREE = PLANS.free;
export const PAID_PLAN_IDS = ["creator", "studio"] as const satisfies readonly PlanId[];

export function isPlanId(s: unknown): s is PlanId {
  return s === "free" || s === "creator" || s === "studio";
}

/** UTC calendar month key, the usage period. */
export function periodKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

export type PaidReason = "length_cap" | "minutes";

export type ExportDecision =
  | { ok: true; plan: PlanId; watermark: boolean; capMs: number; effectiveMs: number; minutes: number }
  | { ok: false; reason: PaidReason; /** can the person still take the free watermarked export instead? */ freeAvailable: boolean };

/**
 * The one place the export rules live. Pure, so it is unit-tested.
 *  - `mode: "best"`: what the caller's plan allows. A caller whose edit is longer than their plan's cap, or who has
 *    no minutes left, gets `ok: false` (the client then shows the paywall).
 *  - `mode: "free"`: the person chose the free export: watermarked and clamped to the free cap, whatever their plan.
 * Nothing the client sends can raise the cap or remove the watermark: the plan comes from the server.
 */
export function decideExport(i: {
  plan: PlanId;
  mode: "best" | "free";
  /** requested cutdown, ms (undefined = full length) */
  requestedMs?: number;
  /** length of the full edit, ms */
  fullMs: number;
  /** minutes already rendered this period */
  minutesUsed: number;
  /** minutes allowed this period for the caller's plan (a stored limit may differ from the default) */
  minutesLimit?: number;
}): ExportDecision {
  const own = PLANS[i.plan];
  const tier = i.mode === "free" ? FREE : own;
  const ownLimit = i.minutesLimit ?? own.monthlyMinutes;
  const limit = i.mode === "free" ? Math.min(ownLimit, FREE.monthlyMinutes) : ownLimit;
  const wanted = Math.min(i.fullMs, i.requestedMs ?? i.fullMs);
  const effectiveMs = Math.min(wanted, tier.exportCapMs);
  const minutes = effectiveMs / 60_000;
  const freeLeft = Math.max(0, Math.min(ownLimit, FREE.monthlyMinutes) - i.minutesUsed);
  const freeFits = (ms: number) => ms / 60_000 <= freeLeft + 1e-9;

  if (i.mode === "best" && wanted > tier.exportCapMs) {
    return { ok: false, reason: "length_cap", freeAvailable: freeFits(Math.min(wanted, FREE.exportCapMs)) };
  }
  if (minutes > Math.max(0, limit - i.minutesUsed) + 1e-9) {
    return { ok: false, reason: "minutes", freeAvailable: i.mode === "best" && i.plan !== "free" && freeFits(Math.min(wanted, FREE.exportCapMs)) };
  }
  return { ok: true, plan: i.mode === "free" ? "free" : i.plan, watermark: tier.watermark, capMs: tier.exportCapMs, effectiveMs, minutes };
}
