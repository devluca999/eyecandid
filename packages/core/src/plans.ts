import { ANON_EXPORTS, PLAN_CATALOG } from "./credits";

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
  /** GPU credits granted once per UTC month while the subscription is live (PLACEHOLDER) */
  monthlyCredits: number;
  /** Convex env var holding the Stripe price id for this plan; absent for free */
  priceEnv?: "STRIPE_PRICE_CREATOR" | "STRIPE_PRICE_STUDIO";
  /** one honest line for the paywall */
  blurb: string;
}

export const PLANS: Record<PlanId, PlanDef> = {
  free: { id: "free", label: "Free", watermark: true, exportCapMs: 60_000, monthlyMinutes: 10, monthlyCredits: 0, blurb: "watermarked, up to 60s" },
  creator: { id: "creator", label: "Creator", watermark: false, exportCapMs: 5 * 60_000, monthlyMinutes: 120, monthlyCredits: 50, priceEnv: "STRIPE_PRICE_CREATOR", blurb: "no watermark, up to 5 min" },
  studio: { id: "studio", label: "Studio", watermark: false, exportCapMs: 15 * 60_000, monthlyMinutes: 600, monthlyCredits: 250, priceEnv: "STRIPE_PRICE_STUDIO", blurb: "no watermark, up to 15 min, more minutes" },
};

/** Credit packs (for Phase 3 generation). PLACEHOLDER sizes; price id env var per pack. */
export const CREDIT_PACKS = {
  small: { credits: 100, priceEnv: "STRIPE_PRICE_CREDITS_SMALL" },
  large: { credits: 500, priceEnv: "STRIPE_PRICE_CREDITS_LARGE" },
} as const;
export type CreditPackId = keyof typeof CREDIT_PACKS;

export const FREE = PLANS.free;

/** Pro (mvp-spec "Access model") is sold as the `creator` plan until the owner names a separate price. */
export const PRO_PLAN: PlanId = "creator";

/** Job types that run on CPU for everyone. Every other job type is GPU work: Pro only, paid with credits. */
export const FREE_CPU_JOB_TYPES = ["hello", "transcribe", "autocut", "reframe", "render"] as const;

/** Credits charged when a GPU job is enqueued (refunded if it finally fails). PLACEHOLDER sizes. */
export const GPU_CREDIT_COST: Record<string, number> = { still: 1, grade: 1, voice: 2, matte: 2, inpaint: 2, i2v: 5, t2v: 5 };

export function isGpuJobType(type: string): boolean {
  return !(FREE_CPU_JOB_TYPES as readonly string[]).includes(type);
}

/**
 * Two worker pools (mvp-spec "Low-cost architecture" 3, ADR 0013). A worker registered with a provider ending in
 * `-gpu` (e.g. `modal-gpu`) is the GPU pool: it claims only GPU job types. Every other worker is the CPU pool and
 * claims only the free CPU types. Enforced on the server in `jobs.claim`, whatever the worker asks for.
 */
export function isGpuWorkerProvider(provider: string | undefined): boolean {
  return !!provider && provider.endsWith("-gpu");
}

/** Can a worker of this provider claim this job type? */
export function poolClaims(provider: string | undefined, type: string): boolean {
  return isGpuWorkerProvider(provider) === isGpuJobType(type);
}

/** Credits a GPU job costs; unknown GPU types cost 1 so nothing GPU-bound is ever free. */
export function gpuCreditCost(type: string): number {
  return isGpuJobType(type) ? (GPU_CREDIT_COST[type] ?? 1) : 0;
}
export const PAID_PLAN_IDS = ["creator", "studio"] as const satisfies readonly PlanId[];

export function isPlanId(s: unknown): s is PlanId {
  return s === "free" || s === "creator" || s === "studio";
}

/** UTC calendar month key, the usage period. */
export function periodKey(ms: number): string {
  return new Date(ms).toISOString().slice(0, 7);
}

// ───────────── free export count (mvp-spec "Access model", ADR 0014 rollout 3) ─────────────

/** a free export without an account: one per anonymous session */
export const ANON_FREE_EXPORTS = ANON_EXPORTS;
/** free exports a calendar month (UTC) with a free account */
export const FREE_EXPORTS_PER_MONTH = PLAN_CATALOG.free.exportsPerMonth ?? 3;

export type ExportCountRefusal = "sign_in_required" | "exports_used";
export type ExportCountDecision = { ok: true; count: boolean } | { ok: false; code: ExportCountRefusal; message: string };

/** "2026-11" → "dec 1": when a month's free exports come back */
export function nextMonthLabel(period: string): string {
  const [y, m] = period.split("-").map(Number);
  const d = new Date(Date.UTC(y!, m!, 1));
  return `${d.toLocaleString("en-US", { month: "short", timeZone: "UTC" }).toLowerCase()} 1`;
}

/**
 * Whether this export may go, and whether it counts. Pure; the server feeds it the count it keeps.
 *  - A paid plan (only ever a signed-in caller): unlimited, not counted.
 *  - Signed in on Free: 3 a calendar month (UTC).
 *  - Anonymous: 1. The next one asks for sign-in, but only when sign-in is actually switched on (Clerk configured and
 *    the `accounts` flag on). Without it the export goes ahead as before: we never ask for something that can't be done.
 */
export function decideExportCount(i: { signedIn: boolean; plan: PlanId; used: number; signInAvailable: boolean; period: string }): ExportCountDecision {
  if (i.signedIn && i.plan !== "free") return { ok: true, count: false };
  if (i.signedIn) {
    if (i.used < FREE_EXPORTS_PER_MONTH) return { ok: true, count: true };
    return { ok: false, code: "exports_used", message: `this month's ${FREE_EXPORTS_PER_MONTH} free exports are used · more on ${nextMonthLabel(i.period)}` };
  }
  if (i.used < ANON_FREE_EXPORTS || !i.signInAvailable) return { ok: true, count: true };
  return { ok: false, code: "sign_in_required", message: `sign in for ${FREE_EXPORTS_PER_MONTH} free exports a month · your edit comes with you` };
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
