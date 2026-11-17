import { ConvexError } from "convex/values";
import { gpuCreditCost, isPlanId, periodKey } from "@eyelore/core";
import type { PlanId } from "@eyelore/core";
import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { flagOn } from "./flags";
import { sha256Hex } from "./workerAuth";
import { ensureEntitlement, entitlementFor } from "./users";

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

// ───────────── Phase 4: GPU jobs are Pro only, paid with credits ─────────────

/** Subscription states that count as a live Pro entitlement. */
const LIVE_SUBSCRIPTION = ["active", "trialing"];

export type GpuRefusal = "pro_required" | "subscription_inactive" | "credits_required";

/**
 * Charge a GPU job against the owner's credits, or throw. Called only from `enqueueJob` (the single enqueue path),
 * after the idempotency check and before the insert, so a refused job never wakes a worker and a replayed key never
 * charges twice. Needs: a signed-in owner whose email is on the `pro` flag's allow list (an approved seat), a paid
 * plan with a live subscription, and enough credits. Nothing here is taken from the client.
 */
export async function chargeGpuJob(ctx: MutationCtx, type: string, ownerUserId: Id<"users"> | undefined): Promise<{ userId: Id<"users">; credits: number } | null> {
  const cost = gpuCreditCost(type);
  if (cost <= 0) return null;
  const refuse = (code: GpuRefusal, message: string, extra: object = {}): never => {
    throw new ConvexError({ code, message, ...extra });
  };
  const user = ownerUserId ? await ctx.db.get(ownerUserId) : null;
  if (!user || user.deletedAt || !user.email) return refuse("pro_required", "generated media is part of Pro · request access on the landing page");
  if (!(await flagOn(ctx, "pro", user.email.toLowerCase()))) return refuse("pro_required", "generated media is part of Pro · this account isn't approved yet");
  const ent = await entitlementFor(ctx, user._id);
  if (!ent || !isPlanId(ent.plan) || ent.plan === "free" || !LIVE_SUBSCRIPTION.includes(ent.subscriptionStatus ?? "")) {
    return refuse("subscription_inactive", "generated media needs an active Pro subscription");
  }
  if (ent.credits < cost) return refuse("credits_required", `this needs ${cost} credit${cost === 1 ? "" : "s"} · you have ${ent.credits}`, { needed: cost, have: ent.credits });
  await ctx.db.patch(ent._id, { credits: ent.credits - cost });
  return { userId: user._id, credits: cost };
}

/** Record what a job was charged, so a final failure can give it back. */
export async function recordCharge(ctx: MutationCtx, jobId: Id<"jobs">, charge: { userId: Id<"users">; credits: number }) {
  await ctx.db.insert("creditCharges", { userId: charge.userId, jobId, credits: charge.credits, at: Date.now() });
}

/** A job failed for good (no retry left): refund its credits once. Safe to call for any job; idempotent. */
export async function refundJobCredits(ctx: MutationCtx, jobId: Id<"jobs">) {
  const charge = await ctx.db.query("creditCharges").withIndex("by_job", (q) => q.eq("jobId", jobId)).unique();
  if (!charge || charge.refundedAt) return false;
  await ctx.db.patch(charge._id, { refundedAt: Date.now() });
  const ent = await entitlementFor(ctx, charge.userId);
  if (ent) await ctx.db.patch(ent._id, { credits: ent.credits + charge.credits });
  return true;
}
