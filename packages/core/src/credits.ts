/**
 * Credits (ADR 0014): what generation costs and how a balance is held, as pure functions.
 *
 * One credit is one generated second at 720p. Editing (transcribe, cut, captions, reframe, render, looks) is never
 * metered. A job reserves its credits when it is enqueued, settles for what it actually made when it passes the
 * quality check, and gets everything back if it fails or the check rejects it.
 *
 * This file is the contract, and the server charges through it (convex/lib/credits.ts, ADR 0014 rollout 1–2): lots in
 * `creditLots`, reserved from the job's generated seconds. The plan amounts still come from plans.ts until the owner
 * confirms the catalog below.
 */

/** Credits per generated second. */
export const CREDITS_PER_SECOND = {
  /** image to video, text to video, background replace / Sets, inpainting, generated voice */
  i2v: 1,
  t2v: 1,
  matte: 1,
  inpaint: 1,
  voice: 1,
  /** a lip-synced talking head costs twice a plain generated second */
  lipsync: 2,
} as const;

/** Job types with a fixed price. A look (`grade`) is editing, so it is free; it stays Pro-only through the GPU gate. */
export const CREDITS_FLAT = { still: 1, grade: 0 } as const;

export type MeteredType = keyof typeof CREDITS_PER_SECOND;

/**
 * Credits to reserve for a generation job. `seconds` is the length being generated (for `voice`, an estimate from
 * the text: the job settles on the real length). A per-second job with no length is refused rather than guessed.
 * Unknown GPU work is charged like plain generation, so nothing new is free by accident.
 */
export function creditCost(type: string, opts: { seconds?: number } = {}): number {
  if (type in CREDITS_FLAT) return CREDITS_FLAT[type as keyof typeof CREDITS_FLAT];
  const rate = (CREDITS_PER_SECOND as Record<string, number>)[type] ?? 1;
  const s = opts.seconds;
  if (s === undefined || !Number.isFinite(s) || s <= 0) throw new Error(`credits: ${type} needs the generated length in seconds`);
  return Math.max(1, Math.ceil(s - 1e-9)) * rate;
}

/** Spoken length of a text at a natural pace (2.5 words a second), for reserving a `voice` job. */
export function estimateSpeechSeconds(text: string): number {
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  return Math.max(1, Math.ceil(words / 2.5));
}

// ───────────── the balance: lots that expire ─────────────

const DAY = 86_400_000;
/** a top-up lasts 12 months */
export const TOPUP_DAYS = 365;
/** credits returned after their lot expired stay usable this long */
export const REFUND_GRACE_DAYS = 30;

/**
 * One grant of credits. `monthly` is the plan's allowance (gone at the end of its UTC month, no rollover), `topup` a
 * bought pack (12 months), `grant` a one-time gift such as the free plan's 10 (no expiry unless given one).
 */
export interface CreditLot {
  id: string;
  kind: "monthly" | "topup" | "grant";
  remaining: number;
  expiresAt?: number;
}

/** What a reservation took, lot by lot, so a refund puts each credit back where it came from. */
export type Taken = { lotId: string; credits: number }[];

const live = (l: CreditLot, now: number) => l.remaining > 0 && (l.expiresAt === undefined || l.expiresAt > now);
/** soonest to expire first (never-expiring last), then by id so the order is stable */
const spendOrder = (a: CreditLot, b: CreditLot) => (a.expiresAt ?? Infinity) - (b.expiresAt ?? Infinity) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
const sum = (t: Taken) => t.reduce((n, x) => n + x.credits, 0);

export function balance(lots: readonly CreditLot[], now: number): number {
  return lots.reduce((n, l) => n + (live(l, now) ? l.remaining : 0), 0);
}

export type Reservation = { ok: true; lots: CreditLot[]; taken: Taken } | { ok: false; needed: number; have: number };

/** Hold `cost` credits, spending whatever expires soonest first. All or nothing. */
export function reserve(lots: readonly CreditLot[], cost: number, now: number): Reservation {
  if (!Number.isInteger(cost) || cost < 0) throw new Error("credits: cost must be a whole number of credits");
  const have = balance(lots, now);
  if (cost > have) return { ok: false, needed: cost, have };
  const next = lots.map((l) => ({ ...l }));
  const taken: Taken = [];
  let left = cost;
  for (const l of next.filter((l) => live(l, now)).sort(spendOrder)) {
    if (!left) break;
    const n = Math.min(l.remaining, left);
    l.remaining -= n;
    left -= n;
    taken.push({ lotId: l.id, credits: n });
  }
  return { ok: true, lots: next, taken };
}

/**
 * Give credits back (the job failed, or the quality check rejected it). Each goes back to its own lot; if that lot
 * has expired or is gone, they come back as a grant good for 30 days, so our failure never costs the person credits.
 */
export function release(lots: readonly CreditLot[], taken: Taken, now: number, refundId: string): CreditLot[] {
  const next = lots.map((l) => ({ ...l }));
  let orphaned = 0;
  for (const t of taken) {
    const l = next.find((x) => x.id === t.lotId);
    if (l && (l.expiresAt === undefined || l.expiresAt > now)) l.remaining += t.credits;
    else orphaned += t.credits;
  }
  if (orphaned) next.push({ id: refundId, kind: "grant", remaining: orphaned, expiresAt: now + REFUND_GRACE_DAYS * DAY });
  return next;
}

/**
 * The job finished and passed the quality check: charge what it actually made, never more than was reserved, and
 * name what to give back. The credits kept are the ones that expire soonest.
 */
export function settle(taken: Taken, actual: number): { charged: Taken; back: Taken } {
  if (!Number.isInteger(actual) || actual < 0) throw new Error("credits: actual must be a whole number of credits");
  let keep = Math.min(actual, sum(taken));
  const charged: Taken = [];
  const back: Taken = [];
  for (const t of taken) {
    const n = Math.min(t.credits, keep);
    keep -= n;
    if (n) charged.push({ lotId: t.lotId, credits: n });
    if (t.credits - n) back.push({ lotId: t.lotId, credits: t.credits - n });
  }
  return { charged, back };
}

/** UTC month key ("2026-11") → the instant the next month starts. */
export function monthEnd(period: string): number {
  const [y, m] = period.split("-").map(Number);
  return Date.UTC(y!, m!, 1);
}
export const monthlyLot = (period: string, credits: number): CreditLot => ({ id: `m:${period}`, kind: "monthly", remaining: credits, expiresAt: monthEnd(period) });
export const topupLot = (id: string, credits: number, boughtAt: number): CreditLot => ({ id, kind: "topup", remaining: credits, expiresAt: boughtAt + TOPUP_DAYS * DAY });

// ───────────── the plans in the goal plan (proposed) ─────────────

export type CatalogPlanId = "free" | "creator" | "pro" | "studio" | "founding";

export interface CatalogPlan {
  id: CatalogPlanId;
  label: string;
  /** credits each month (no rollover) */
  monthlyCredits: number;
  /** credits given once, on the first sign-in */
  oneTimeCredits: number;
  /** exports a month; null = unlimited under fair use */
  exportsPerMonth: number | null;
  /** fair use: hours of raw footage a month; null where exports are counted instead */
  fairUseRawHours: number | null;
  maxHeight: 720 | 1080 | 2160;
  watermark: boolean;
  seats: number;
}

/**
 * docs/pricing-and-quality-plan.md as data. PROPOSED: the server enforces plans.ts until the owner confirms the free
 * tier and the prices exist in Stripe (ADR 0014). No prices here: Stripe is the source of truth for money (ADR 0009).
 */
export const PLAN_CATALOG_IS_PROPOSED = true;
export const PLAN_CATALOG: Record<CatalogPlanId, CatalogPlan> = {
  free: { id: "free", label: "Free", monthlyCredits: 0, oneTimeCredits: 10, exportsPerMonth: 3, fairUseRawHours: null, maxHeight: 720, watermark: true, seats: 1 },
  creator: { id: "creator", label: "Creator", monthlyCredits: 100, oneTimeCredits: 0, exportsPerMonth: null, fairUseRawHours: 10, maxHeight: 1080, watermark: false, seats: 1 },
  pro: { id: "pro", label: "Pro", monthlyCredits: 500, oneTimeCredits: 0, exportsPerMonth: null, fairUseRawHours: 10, maxHeight: 2160, watermark: false, seats: 1 },
  studio: { id: "studio", label: "Studio", monthlyCredits: 2500, oneTimeCredits: 0, exportsPerMonth: null, fairUseRawHours: 10, maxHeight: 2160, watermark: false, seats: 3 },
  /** the beta plan for the first 100 approved people: Creator's price, Pro's credits */
  founding: { id: "founding", label: "Founding", monthlyCredits: 500, oneTimeCredits: 0, exportsPerMonth: null, fairUseRawHours: 10, maxHeight: 1080, watermark: false, seats: 1 },
};
/** a top-up pack */
export const TOPUP_CREDITS = 120;
/** a free export without an account: one per anonymous session (mvp-spec "Access model") */
export const ANON_EXPORTS = 1;

/** Upper estimate of what one credit costs us, all in (cold starts, failed takes): the goal plan's $0.02–0.03. */
export const COST_PER_CREDIT_USD = 0.03;
/** The most a plan's monthly credits can cost us in generation. */
export const worstCaseGenerationUsd = (plan: CatalogPlanId) => PLAN_CATALOG[plan].monthlyCredits * COST_PER_CREDIT_USD;
