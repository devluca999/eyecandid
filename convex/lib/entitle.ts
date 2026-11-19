import { ConvexError } from "convex/values";
import { balance, isGpuJobType, isPlanId, periodKey, reserve } from "@eyelore/core";
import type { PlanId, Taken } from "@eyelore/core";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { flagOn } from "./flags";
import { sha256Hex } from "./workerAuth";
import { ensureEntitlement, entitlementFor } from "./users";
import { jobCreditCost, ledgerFor, LIVE_SUBSCRIPTION, saveLedger } from "./credits";

export { refundJobCredits, settleJobCredits } from "./credits";

export interface Usage {
  plan: PlanId;
  minutesUsed: number;
  /** stored limit for signed-in users (a support override); undefined = the plan default */
  minutesLimit?: number;
  signedIn: boolean;
}

export const anonHashOf = async (anonId: string) => (await sha256Hex(anonId)).slice(0, 32);

/**
 * The caller's plan and this period's usage, resolved on the server. Only the authenticated identity can have a
 * paid plan: an anon id never does, whatever is passed.
 */
export async function usageFor(ctx: QueryCtx | MutationCtx, who: { userId?: Id<"users">; anonId?: string }, now = Date.now()): Promise<Usage> {
  const period = periodKey(now);
  if (who.userId) {
    const ent = await entitlementFor(ctx, who.userId);
    if (!ent) return { plan: "free", minutesUsed: 0, signedIn: true };
    return {
      plan: isPlanId(ent.plan) ? ent.plan : "free",
      minutesUsed: ent.period === period ? ent.minutesUsed : 0,
      minutesLimit: ent.minutesLimit,
      signedIn: true,
    };
  }
  if (who.anonId) {
    const hash = await anonHashOf(who.anonId);
    const row = await ctx.db.query("anonUsage").withIndex("by_anon_period", (q) => q.eq("anonHash", hash).eq("period", period)).unique();
    return { plan: "free", minutesUsed: row?.minutesUsed ?? 0, signedIn: false };
  }
  return { plan: "free", minutesUsed: 0, signedIn: false };
}

/** Add rendered minutes to whoever was charged. Resets a user's counter on a new month. */
export async function addUsage(ctx: MutationCtx, to: { userId?: Id<"users">; anonHash?: string }, minutes: number, now = Date.now()) {
  const period = periodKey(now);
  if (to.userId) {
    const ent = await ensureEntitlement(ctx, to.userId, now);
    const base = ent.period === period ? ent.minutesUsed : 0;
    await ctx.db.patch(ent._id, { minutesUsed: base + minutes, period });
  } else if (to.anonHash) {
    const row = await ctx.db.query("anonUsage").withIndex("by_anon_period", (q) => q.eq("anonHash", to.anonHash!).eq("period", period)).unique();
    if (row) await ctx.db.patch(row._id, { minutesUsed: row.minutesUsed + minutes });
    else await ctx.db.insert("anonUsage", { anonHash: to.anonHash, period, minutesUsed: minutes });
  }
}

// ───────────── Phase 4: GPU jobs are Pro only, paid with credits (ADR 0014: one credit = one generated second) ─────────────

export type GpuRefusal = "pro_required" | "subscription_inactive" | "credits_required";

export type GpuStanding =
  | { ok: true; userId: Id<"users">; credits: number }
  | { ok: false; code: GpuRefusal; message: string; extra?: { needed: number; have: number } };

/**
 * Would a GPU job of this cost be allowed for this user right now? The one place the Pro rules live: `chargeGpuJob`
 * uses it and then reserves the credits; the editor's queries use it only to decide whether to show the action.
 * `credits` is the live balance over the user's lots (convex/lib/credits.ts).
 */
export async function gpuStanding(ctx: QueryCtx | MutationCtx, ownerUserId: Id<"users"> | undefined, cost: number, now = Date.now()): Promise<GpuStanding> {
  const user = ownerUserId ? await ctx.db.get(ownerUserId) : null;
  if (!user || user.deletedAt || !user.email) return { ok: false, code: "pro_required", message: "generated media is part of Pro · request access on the landing page" };
  if (!(await flagOn(ctx, "pro", user.email.toLowerCase()))) return { ok: false, code: "pro_required", message: "generated media is part of Pro · this account isn't approved yet" };
  const ent = await entitlementFor(ctx, user._id);
  if (!ent || !isPlanId(ent.plan) || ent.plan === "free" || !LIVE_SUBSCRIPTION.includes(ent.subscriptionStatus ?? "")) {
    return { ok: false, code: "subscription_inactive", message: "generated media needs an active Pro subscription" };
  }
  const have = balance((await ledgerFor(ctx, user._id, now)).lots, now);
  if (have < cost) return { ok: false, code: "credits_required", message: `this needs ${cost} credit${cost === 1 ? "" : "s"} · you have ${have}`, extra: { needed: cost, have } };
  return { ok: true, userId: user._id, credits: have };
}

export type Charge = { userId: Id<"users">; credits: number; taken: Taken };

/**
 * Reserve a GPU job's credits against the owner's lots, or throw. Called only from `enqueueJob` (the single enqueue
 * path), after the idempotency check and before the insert, so a refused job never wakes a worker and a replayed key
 * never charges twice. The cost comes from the job's own input (`jobCreditCost`); a look costs nothing but still needs
 * Pro. Needs: a signed-in owner whose email is on the `pro` flag's allow list (an approved seat), a paid plan with a
 * live subscription, and enough credits. Nothing here is taken from the client.
 */
export async function chargeGpuJob(ctx: MutationCtx, type: string, input: unknown, ownerUserId: Id<"users"> | undefined, now = Date.now()): Promise<Charge | null> {
  if (!isGpuJobType(type)) return null;
  // Pro first, so a free account hears about Pro rather than about seconds; the balance is checked by `reserve`
  const s = await gpuStanding(ctx, ownerUserId, 0, now);
  if (!s.ok) throw new ConvexError({ code: s.code, message: s.message, ...(s.extra ?? {}) });
  const cost = await jobCreditCost(ctx, type, input);
  if (cost === 0) return null;
  const l = await ledgerFor(ctx, s.userId, now);
  const r = reserve(l.lots, cost, now);
  if (!r.ok) throw new ConvexError({ code: "credits_required", message: `this needs ${cost} credit${cost === 1 ? "" : "s"} · you have ${r.have}`, needed: cost, have: r.have });
  await saveLedger(ctx, l, r.lots, now);
  return { userId: s.userId, credits: cost, taken: r.taken };
}

/** Record what a job reserved, lot by lot, so it can be settled or refunded exactly once. */
export async function recordCharge(ctx: MutationCtx, jobId: Id<"jobs">, charge: Charge) {
  await ctx.db.insert("creditCharges", { userId: charge.userId, jobId, credits: charge.credits, taken: charge.taken, at: Date.now() });
}
