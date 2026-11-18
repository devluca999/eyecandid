import { ConvexError } from "convex/values";
import { creditCost, estimateSpeechSeconds, isPlanId, monthlyLot, periodKey, PLANS, release, settle, topupLot } from "@eyelore/core";
import type { CreditLot, PlanId, Taken } from "@eyelore/core";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ensureEntitlement, entitlementFor } from "./users";

/**
 * Credits on the server (ADR 0014): the pure model in packages/core/src/credits.ts over the `creditLots` table.
 *
 * A user's balance is their lots. Two kinds of lot can exist before they are written, and are counted in reads and
 * written by the first mutation that touches the balance:
 *  - `legacy:<entitlement>`: a balance from before ADR 0014 (`entitlements.credits`), migrated with no expiry. The
 *    write zeroes `entitlements.credits` in the same transaction. `migrations.creditsToLots` folds every row at once.
 *  - `m:<UTC month>`: this month's allowance for a live subscription. Lots die at month end, but Stripe's renewal
 *    arrives on the billing anniversary, so without this someone who paid on the 20th would have nothing from the 1st
 *    to the 20th. Same lot id as the webhook's grant, and `entitlements.creditsPeriod` marks it, so it is granted once.
 */

/** Subscription states that count as a live paid entitlement. */
export const LIVE_SUBSCRIPTION = ["active", "trialing"];

export const legacyLotId = (entId: Id<"entitlements">) => `legacy:${entId}`;
export const monthlyLotId = (period: string) => `m:${period}`;

export type Ledger = {
  userId: Id<"users">;
  ent: Doc<"entitlements"> | null;
  rows: Map<string, Doc<"creditLots">>;
  lots: CreditLot[];
  /** set when the ledger includes a balance not yet folded out of `entitlements.credits` */
  legacy: boolean;
  /** set when the ledger includes this month's allowance not yet written */
  monthly?: string;
};

function monthlyDue(ent: Doc<"entitlements">, now: number): number {
  if (!isPlanId(ent.plan) || !LIVE_SUBSCRIPTION.includes(ent.subscriptionStatus ?? "")) return 0;
  // granted this month already: as a lot, or (before ADR 0014) inside entitlements.credits
  if (ent.creditsPeriod === periodKey(now)) return 0;
  return PLANS[ent.plan].monthlyCredits;
}

/** The user's lots as the pure model sees them, including the two kinds that may not be written yet (above). */
export async function ledgerFor(ctx: QueryCtx | MutationCtx, userId: Id<"users">, now: number): Promise<Ledger> {
  const ent = await entitlementFor(ctx, userId);
  const stored = await ctx.db.query("creditLots").withIndex("by_user_lot", (q) => q.eq("userId", userId)).collect();
  const rows = new Map(stored.map((r) => [r.lotId, r]));
  const lots: CreditLot[] = stored.map((r) => ({ id: r.lotId, kind: r.kind, remaining: r.remaining, expiresAt: r.expiresAt }));
  let legacy = false;
  let monthly: string | undefined;
  if (ent && ent.credits > 0) {
    legacy = true;
    const id = legacyLotId(ent._id);
    const lot = lots.find((l) => l.id === id);
    if (lot) lot.remaining += ent.credits;
    else lots.push({ id, kind: "grant", remaining: ent.credits });
  }
  const due = ent ? monthlyDue(ent, now) : 0;
  if (due > 0 && !rows.has(monthlyLotId(periodKey(now)))) {
    monthly = periodKey(now);
    lots.push(monthlyLot(monthly, due));
  }
  return { userId, ent, rows, lots, legacy, monthly };
}

/** Write a ledger's lots back: patch what changed, insert what is new, and mark what was folded in. */
export async function saveLedger(ctx: MutationCtx, l: Ledger, next: readonly CreditLot[], now: number) {
  for (const lot of next) {
    const row = l.rows.get(lot.id);
    if (row) {
      if (row.remaining !== lot.remaining) await ctx.db.patch(row._id, { remaining: lot.remaining });
    } else {
      await ctx.db.insert("creditLots", { userId: l.userId, lotId: lot.id, kind: lot.kind, remaining: lot.remaining, expiresAt: lot.expiresAt, createdAt: now });
    }
  }
  if (l.ent && (l.legacy || l.monthly)) {
    await ctx.db.patch(l.ent._id, { ...(l.legacy ? { credits: 0 } : {}), ...(l.monthly ? { creditsPeriod: l.monthly } : {}) });
  }
}

/**
 * The plan's monthly credits as this month's lot, once per UTC month (`creditsPeriod`, and the lot id), so a Stripe
 * retry, a renewal and the first checkout can never grant twice. The lot ends with the month: no rollover.
 */
export async function grantMonthlyCredits(ctx: MutationCtx, userId: Id<"users">, plan: PlanId, now = Date.now()) {
  const monthly = PLANS[plan].monthlyCredits;
  if (monthly <= 0) return false;
  const ent = await ensureEntitlement(ctx, userId, now);
  const period = periodKey(now);
  if (ent.creditsPeriod === period) return false;
  await ctx.db.patch(ent._id, { creditsPeriod: period });
  const id = monthlyLotId(period);
  if (await lotRow(ctx, userId, id)) return false;
  const lot = monthlyLot(period, monthly);
  await ctx.db.insert("creditLots", { userId, lotId: lot.id, kind: lot.kind, remaining: lot.remaining, expiresAt: lot.expiresAt, createdAt: now });
  return true;
}

/** A bought pack as a lot that lasts 12 months. Idempotent on the lot id (one per checkout session). */
export async function grantTopup(ctx: MutationCtx, userId: Id<"users">, lotId: string, credits: number, now = Date.now()) {
  if (await lotRow(ctx, userId, lotId)) return false;
  const lot = topupLot(lotId, credits, now);
  await ctx.db.insert("creditLots", { userId, lotId: lot.id, kind: lot.kind, remaining: lot.remaining, expiresAt: lot.expiresAt, createdAt: now });
  return true;
}

const lotRow = (ctx: QueryCtx | MutationCtx, userId: Id<"users">, lotId: string) =>
  ctx.db.query("creditLots").withIndex("by_user_lot", (q) => q.eq("userId", userId).eq("lotId", lotId)).unique();

/**
 * What a GPU job costs, from its (already parsed) input: the generated length for per-second work, flat for a still
 * or a look. A per-second job whose length we can't tell is refused before anything is charged, never guessed.
 */
export async function jobCreditCost(ctx: QueryCtx | MutationCtx, type: string, input: unknown): Promise<number> {
  const i = (input ?? {}) as { durationMs?: number; text?: string; mediaId?: string };
  let seconds: number | undefined;
  if (type === "i2v" || type === "t2v") seconds = typeof i.durationMs === "number" ? i.durationMs / 1000 : undefined;
  else if (type === "voice") seconds = typeof i.text === "string" && i.text.trim() ? estimateSpeechSeconds(i.text) : undefined;
  else if ((type === "matte" || type === "inpaint" || type === "lipsync") && i.mediaId) {
    const id = ctx.db.normalizeId("media", i.mediaId);
    const m = id ? await ctx.db.get(id) : null;
    seconds = m?.durationMs ? m.durationMs / 1000 : undefined;
  }
  try {
    return creditCost(type, { seconds });
  } catch {
    throw new ConvexError({ code: "length_required", message: "couldn't tell how many seconds this makes · nothing was charged" });
  }
}

/** What a finished job actually made, in credits. Only voice differs from the reservation (its length was estimated). */
function actualCredits(type: string, output: unknown, reserved: number): number {
  if (type === "voice") {
    const words = (output as { words?: { endMs: number }[] } | undefined)?.words ?? [];
    const endMs = words.reduce((n, w) => Math.max(n, w.endMs), 0);
    if (endMs > 0) return creditCost("voice", { seconds: endMs / 1000 });
  }
  return reserved;
}

const chargeOf = (ctx: QueryCtx | MutationCtx, jobId: Id<"jobs">) => ctx.db.query("creditCharges").withIndex("by_job", (q) => q.eq("jobId", jobId)).unique();

/**
 * The job succeeded: charge what it made, never more than was reserved, and give back the rest. Once per charge;
 * a charge already settled or refunded is left alone.
 */
export async function settleJobCredits(ctx: MutationCtx, job: Doc<"jobs">, output: unknown, now = Date.now()) {
  const charge = await chargeOf(ctx, job._id);
  if (!charge || charge.settledAt || charge.refundedAt) return false;
  const actual = Math.min(charge.credits, actualCredits(job.type, output, charge.credits));
  if (charge.taken) {
    const { back } = settle(charge.taken, actual);
    if (back.length) {
      const l = await ledgerFor(ctx, charge.userId, now);
      await saveLedger(ctx, l, release(l.lots, back, now, `r:${charge._id}`), now);
    }
  }
  await ctx.db.patch(charge._id, { settledAt: now, actual });
  return true;
}

export type RefundReason = "failed" | "qc_failed" | "cancelled";

/**
 * Give a job's credits back, each to the lot it came from (a lot that has expired since comes back as a grant good
 * for 30 days). Once per charge, and never after a settle. Safe to call for any job.
 */
export async function refundJobCredits(ctx: MutationCtx, jobId: Id<"jobs">, reason: RefundReason = "failed", now = Date.now()) {
  const charge = await chargeOf(ctx, jobId);
  if (!charge || charge.refundedAt || charge.settledAt) return false;
  const l = await ledgerFor(ctx, charge.userId, now);
  let lots = l.lots;
  let taken: Taken | undefined = charge.taken;
  if (!taken) {
    // charged before ADR 0014, from entitlements.credits: back to the migrated balance, which never expires
    const ent = l.ent ?? (await ensureEntitlement(ctx, charge.userId, now));
    const id = legacyLotId(ent._id);
    if (!lots.some((x) => x.id === id)) lots = [...lots, { id, kind: "grant", remaining: 0 }];
    taken = [{ lotId: id, credits: charge.credits }];
  }
  await saveLedger(ctx, l, release(lots, taken, now, `r:${charge._id}`), now);
  await ctx.db.patch(charge._id, { refundedAt: now, refundReason: reason });
  return true;
}
