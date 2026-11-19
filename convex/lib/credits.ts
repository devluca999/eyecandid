import { ConvexError } from "convex/values";
import { creditCost, estimateSpeechSeconds, periodKey, PLANS, release, reserve, settle, topupLot } from "@eyelore/core";
import type { CreditLot, PlanId, Taken } from "@eyelore/core";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { ensureEntitlement, entitlementFor } from "./users";

/**
 * Credits on the server (ADR 0014): the pure model in packages/core/src/credits.ts over the `creditLots` table.
 *
 * A user's balance is their lots. One kind of lot can exist before it is written: `legacy:<entitlement>`, a balance
 * from before ADR 0014 (`entitlements.credits`), migrated with no expiry. Reads count it; the first mutation that
 * touches the balance writes it and zeroes `entitlements.credits` in the same transaction.
 * `migrations.creditsToLots` folds every row at once.
 *
 * A plan's allowance is granted only for a period Stripe says was paid (`grantPeriodCredits`), and lasts until that
 * period ends. Nothing is granted for a month nobody paid for.
 */

/** Subscription states that count as a live paid entitlement. */
export const LIVE_SUBSCRIPTION = ["active", "trialing"];

export const legacyLotId = (entId: Id<"entitlements">) => `legacy:${entId}`;

export type Ledger = {
  userId: Id<"users">;
  ent: Doc<"entitlements"> | null;
  rows: Map<string, Doc<"creditLots">>;
  lots: CreditLot[];
  /** set when the ledger includes a balance not yet folded out of `entitlements.credits` */
  legacy: boolean;
};

/** The user's lots as the pure model sees them, including a balance not yet folded out of `entitlements.credits`. */
export async function ledgerFor(ctx: QueryCtx | MutationCtx, userId: Id<"users">, _now?: number): Promise<Ledger> {
  const ent = await entitlementFor(ctx, userId);
  const stored = await ctx.db.query("creditLots").withIndex("by_user_lot", (q) => q.eq("userId", userId)).collect();
  const rows = new Map(stored.map((r) => [r.lotId, r]));
  const lots: CreditLot[] = stored.map((r) => ({ id: r.lotId, kind: r.kind, remaining: r.remaining, expiresAt: r.expiresAt }));
  let legacy = false;
  if (ent && ent.credits > 0) {
    legacy = true;
    const id = legacyLotId(ent._id);
    const lot = lots.find((l) => l.id === id);
    if (lot) lot.remaining += ent.credits;
    else lots.push({ id, kind: "grant", remaining: ent.credits });
  }
  return { userId, ent, rows, lots, legacy };
}

/** Write a ledger's lots back: patch what changed, insert what is new, and zero a folded legacy balance. */
export async function saveLedger(ctx: MutationCtx, l: Ledger, next: readonly CreditLot[], now: number) {
  for (const lot of next) {
    const row = l.rows.get(lot.id);
    if (row) {
      if (row.remaining !== lot.remaining) await ctx.db.patch(row._id, { remaining: lot.remaining });
    } else {
      await ctx.db.insert("creditLots", { userId: l.userId, lotId: lot.id, kind: lot.kind, remaining: lot.remaining, expiresAt: lot.expiresAt, createdAt: now });
    }
  }
  if (l.ent && l.legacy) await ctx.db.patch(l.ent._id, { credits: 0 });
}

/** One calendar month after `ms` (UTC), clamped to the month's last day: Jan 31 → Feb 28. */
export function addMonthUtc(ms: number): number {
  const d = new Date(ms);
  const y = d.getUTCFullYear();
  const m = d.getUTCMonth() + 1;
  const last = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
  return Date.UTC(y, m, Math.min(d.getUTCDate(), last), d.getUTCHours(), d.getUTCMinutes(), d.getUTCSeconds());
}

/**
 * The plan's allowance for one PAID billing period, as a lot that ends when the period ends (no rollover). `lotId`
 * names the period (`p:<subscription>:first` for the first, `p:<subscription>:<period start>` for each renewal), so
 * a replayed or duplicate event (checkout and the first invoice both report the first period) never grants twice.
 * A later report of the same period may correct its end, never its credits.
 *
 * `paidBefore`: this exact period was already paid out by the code before ADR 0014 (`legacyFirstPeriodPaid`), so it is
 * not granted again.
 */
export async function grantPeriodCredits(ctx: MutationCtx, userId: Id<"users">, plan: PlanId, lotId: string, periodEnd: number, now = Date.now(), paidBefore = false) {
  const credits = PLANS[plan].monthlyCredits;
  if (credits <= 0 || periodEnd <= now) return false;
  const ent = await ensureEntitlement(ctx, userId, now);
  const row = await lotRow(ctx, userId, lotId);
  if (row) {
    if (row.expiresAt !== periodEnd) await ctx.db.patch(row._id, { expiresAt: periodEnd });
    return false;
  }
  if (paidBefore) return false;
  await ctx.db.insert("creditLots", { userId, lotId, kind: "monthly", remaining: credits, expiresAt: periodEnd, createdAt: now });
  return true;
}

/**
 * Before ADR 0014 a checkout put the first month's credits into `entitlements.credits` and set `creditsPeriod`. That
 * first period is already paid out only for the subscription that was live then (`stripeSubscriptionId` at the time,
 * read before this event changes it) and only if it was granted this month or last: a returning subscriber on a new
 * subscription, or one whose old grant is long past, is granted as anyone else.
 */
export function legacyFirstPeriodPaid(ent: Doc<"entitlements"> | null, sub: string, now: number): boolean {
  if (!ent?.creditsPeriod || ent.stripeSubscriptionId !== sub) return false;
  const d = new Date(now);
  const last = periodKey(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
  return ent.creditsPeriod === periodKey(now) || ent.creditsPeriod === last;
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
 * The job succeeded: charge what it made and give back the rest. Once per charge; a charge already settled or
 * refunded is left alone. If it made more than was reserved (voice, whose length was estimated), the difference is
 * taken too when the balance allows; otherwise it settles at the reservation and `uncharged` records the gap.
 */
export async function settleJobCredits(ctx: MutationCtx, job: Doc<"jobs">, output: unknown, now = Date.now()) {
  const charge = await chargeOf(ctx, job._id);
  if (!charge || charge.settledAt || charge.refundedAt) return false;
  const made = actualCredits(job.type, output, charge.credits);
  if (made > charge.credits && charge.taken) {
    const extra = made - charge.credits;
    const l = await ledgerFor(ctx, charge.userId, now);
    const r = reserve(l.lots, extra, now);
    if (r.ok) {
      await saveLedger(ctx, l, r.lots, now);
      await ctx.db.patch(charge._id, { settledAt: now, actual: made, credits: made, taken: [...charge.taken, ...r.taken] });
    } else {
      await ctx.db.patch(charge._id, { settledAt: now, actual: charge.credits, uncharged: extra });
    }
    return true;
  }
  const actual = Math.min(charge.credits, made);
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
 * Give a job's credits back, each to the lot it came from. Once per charge, and never after a settle. Safe to call
 * for any job. If the lot has expired since: for our failure (`failed`, `qc_failed`) the credits come back as a grant
 * good for 30 days; for the person deleting their edit (`cancelled`) they lapse with their lot, as unused ones would.
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
  if (reason === "cancelled") {
    const liveIds = new Set(lots.filter((x) => x.expiresAt === undefined || x.expiresAt > now).map((x) => x.id));
    taken = taken.filter((t) => liveIds.has(t.lotId));
  }
  await saveLedger(ctx, l, release(lots, taken, now, `r:${charge._id}`), now);
  await ctx.db.patch(charge._id, { refundedAt: now, refundReason: reason });
  return true;
}
