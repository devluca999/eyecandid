import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, internalMutation, internalQuery, mutation, query } from "./_generated/server";
import type { MutationCtx, QueryCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { isPlanId, PRO_PLAN } from "@eyelore/core";
import { caller } from "./lib/owner";
import { adminGate, sha256Hex } from "./lib/workerAuth";
import { flagOn } from "./lib/flags";
import { entitlementFor, userByClerkId } from "./lib/users";
import { createStripeCheckout } from "./billing";
import { escapeHtml, sendPulseEmail } from "./notify";
import { rateLimit } from "./lib/limits";

const DAY_MS = 24 * 60 * 60 * 1000;
/** at most this many requests per email and per anonymous session in any 24 hours */
export const ACCESS_REQUESTS_PER_DAY = 3;

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Validates and normalises a request; returns a user-facing message on the first problem. */
export function cleanAccessRequest(input: { email: string; note: string; link: string }) {
  const email = input.email.trim().toLowerCase();
  const note = input.note.trim();
  const link = input.link.trim();
  if (!email || email.length > 254 || !EMAIL.test(email)) return { error: "that email doesn't look right" } as const;
  if (note.length > 500) return { error: "keep what you make under 500 characters" } as const;
  if (link) {
    if (link.length > 300) return { error: "that link is too long" } as const;
    let url: URL;
    try {
      url = new URL(/^https?:\/\//i.test(link) ? link : `https://${link}`);
    } catch {
      return { error: "that link doesn't look right" } as const;
    }
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".")) return { error: "that link doesn't look right" } as const;
    return { value: { email, note, link: url.toString() } } as const;
  }
  return { value: { email, note, link: "" } } as const;
}

/**
 * Pro is by request (docs: mvp-spec "Access model"). Anyone may ask; nothing is granted here. A second request
 * for an email that is still waiting (or already approved) writes nothing and answers the same "got it".
 */
export const request = mutation({
  args: { anonId: v.string(), email: v.string(), note: v.string(), link: v.string(), clientHint: v.optional(v.string()) },
  handler: async (ctx, { anonId, clientHint, ...input }) => {
    await caller(ctx, anonId); // validates the anon id's shape
    await rateLimit(ctx, "access", { anonId, clientHint });
    const r = cleanAccessRequest(input);
    if ("error" in r) throw new ConvexError(r.error!);
    const { email, note, link } = r.value;
    const earlier = await ctx.db.query("accessRequests").withIndex("by_email_created", (q) => q.eq("email", email)).order("desc").take(20);
    if (earlier.some((row) => row.status !== "declined")) return { ok: true as const, duplicate: true as const };
    const since = Date.now() - DAY_MS;
    const byEmail = earlier.filter((row) => row.createdAt > since);
    const anonHash = (await sha256Hex(anonId)).slice(0, 32);
    const byAnon = await ctx.db
      .query("accessRequests")
      .withIndex("by_anon_created", (q) => q.eq("anonHash", anonHash).gt("createdAt", since))
      .take(ACCESS_REQUESTS_PER_DAY);
    if (byEmail.length >= ACCESS_REQUESTS_PER_DAY || byAnon.length >= ACCESS_REQUESTS_PER_DAY) {
      throw new ConvexError("you've already asked today · we'll be in touch");
    }
    await ctx.db.insert("accessRequests", { email, note, link, anonHash, createdAt: Date.now(), status: "new" });
    return { ok: true as const };
  },
});

// ───────────── admin: /admin/access (EYELORE_ADMIN_TOKEN, like /funnel) ─────────────

export const DEFAULT_PRO_SEATS = 100;
const MAX_LISTED = 200;

/** The Pro seat cap: Convex env EYELORE_PRO_SEATS, default 100. A missing or malformed value falls back to 100. */
export function proSeats(raw = process.env.EYELORE_PRO_SEATS): number {
  const n = raw === undefined || raw.trim() === "" ? NaN : Number(raw);
  return Number.isInteger(n) && n >= 0 && n <= 100_000 ? n : DEFAULT_PRO_SEATS;
}

async function seatsUsed(ctx: QueryCtx | MutationCtx, cap: number): Promise<number> {
  const rows = await ctx.db.query("accessRequests").withIndex("by_status_created", (q) => q.eq("status", "approved")).take(cap + 1);
  return rows.length;
}

async function requireAdmin(token: string) {
  const g = await adminGate(token);
  if (g === "unconfigured") throw new ConvexError("admin not configured · set EYELORE_ADMIN_TOKEN on the Convex deployment");
  if (g === "denied") throw new ConvexError("not allowed");
}

const publicRow = (r: Doc<"accessRequests">) => ({
  _id: r._id,
  email: r.email,
  note: r.note,
  link: r.link,
  createdAt: r.createdAt,
  status: r.status,
  decidedAt: r.decidedAt,
  emailStatus: r.emailStatus,
  emailDetail: r.emailDetail,
});

/** Requests for the admin page, new ones first (then approved, then declined; newest first in each). Reactive. */
export const adminList = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const g = await adminGate(token);
    if (g !== "ok") return { state: g } as const;
    const cap = proSeats();
    const rows: ReturnType<typeof publicRow>[] = [];
    for (const status of ["new", "approved", "declined"] as const) {
      const got = await ctx.db.query("accessRequests").withIndex("by_status_created", (q) => q.eq("status", status)).order("desc").take(MAX_LISTED);
      rows.push(...got.map(publicRow));
    }
    return { state: "ok" as const, seats: { used: await seatsUsed(ctx, cap), cap }, rows };
  },
});

/** Add or remove an email on the `pro` flag's allow list. The row is created enabled with rolloutPct 0: allow list only. */
async function setProAllow(ctx: MutationCtx, email: string, allowed: boolean) {
  const row = await ctx.db.query("flags").withIndex("by_key", (q) => q.eq("key", "pro")).unique();
  if (!row) {
    if (allowed) await ctx.db.insert("flags", { key: "pro", enabled: true, rolloutPct: 0, allow: [email] });
    return;
  }
  const has = row.allow.includes(email);
  if (allowed && !has) await ctx.db.patch(row._id, { allow: [...row.allow, email] });
  if (!allowed && has) await ctx.db.patch(row._id, { allow: row.allow.filter((e) => e !== email) });
}

export type ApproveResult = { ok: true; already?: true; seats: { used: number; cap: number } } | { ok: false; error: string; seats: { used: number; cap: number } };

/**
 * Approve a request: take a seat (refused at the cap), put the email on the `pro` allow list and send the
 * "you're in" email with a checkout link. Approving twice changes nothing and sends nothing.
 */
export const approve = mutation({
  args: { token: v.string(), requestId: v.id("accessRequests") },
  handler: async (ctx, { token, requestId }): Promise<ApproveResult> => {
    await requireAdmin(token);
    const cap = proSeats();
    const used = await seatsUsed(ctx, cap);
    const row = await ctx.db.get(requestId);
    if (!row) throw new ConvexError("that request is gone");
    if (row.status === "approved") return { ok: true, already: true, seats: { used, cap } };
    if (used >= cap) {
      return { ok: false, error: `all ${cap} Pro seats are taken · decline someone or raise EYELORE_PRO_SEATS`, seats: { used, cap } };
    }
    await ctx.db.patch(requestId, { status: "approved", decidedAt: Date.now(), emailStatus: "queued", emailDetail: undefined, inviteTokenHash: undefined });
    await setProAllow(ctx, row.email, true);
    await ctx.scheduler.runAfter(0, internal.access.sendInvite, { requestId });
    return { ok: true, seats: { used: used + 1, cap } };
  },
});

/** Decline a request (no email). Declining an approved one frees its seat and takes it off the allow list. */
export const decline = mutation({
  args: { token: v.string(), requestId: v.id("accessRequests") },
  handler: async (ctx, { token, requestId }) => {
    await requireAdmin(token);
    const row = await ctx.db.get(requestId);
    if (!row) throw new ConvexError("that request is gone");
    if (row.status === "declined") return { ok: true as const, already: true as const };
    if (row.status === "approved") await setProAllow(ctx, row.email, false);
    await ctx.db.patch(requestId, { status: "declined", decidedAt: Date.now(), inviteTokenHash: undefined });
    return { ok: true as const };
  },
});

/** Send the invite again (a new link; the old one stops working), e.g. once SendPulse is configured. */
export const resendInvite = mutation({
  args: { token: v.string(), requestId: v.id("accessRequests") },
  handler: async (ctx, { token, requestId }) => {
    await requireAdmin(token);
    const row = await ctx.db.get(requestId);
    if (row?.status !== "approved") throw new ConvexError("only an approved request has an invite");
    await ctx.db.patch(requestId, { emailStatus: "queued", emailDetail: undefined });
    await ctx.scheduler.runAfter(0, internal.access.sendInvite, { requestId });
    return { ok: true as const };
  },
});

// ───────────── the invite email and its checkout link ─────────────

const INVITE = /^eci_[0-9a-f]{64}$/;

function inviteToken(): string {
  const a = new Uint8Array(32);
  crypto.getRandomValues(a);
  return "eci_" + [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Store the hash of a fresh invite token on an approved request (replacing any earlier link). */
export const mintInvite = internalMutation({
  args: { requestId: v.id("accessRequests"), tokenHash: v.string() },
  handler: async (ctx, { requestId, tokenHash }) => {
    const row = await ctx.db.get(requestId);
    if (row?.status !== "approved") return null;
    await ctx.db.patch(requestId, { inviteTokenHash: tokenHash });
    return { email: row.email };
  },
});

export const inviteFinish = internalMutation({
  args: { requestId: v.id("accessRequests"), status: v.union(v.literal("sent"), v.literal("not_sent"), v.literal("failed")), detail: v.optional(v.string()) },
  handler: async (ctx, { requestId, status, detail }) => {
    if (await ctx.db.get(requestId)) await ctx.db.patch(requestId, { emailStatus: status, emailDetail: detail });
  },
});

/**
 * "You're in": a link to /pro/checkout?token=… that starts Stripe Checkout after sign-in. The token is minted here
 * (an action, so it uses real randomness) and only its hash is stored. Without SendPulse the row says
 * "not sent · SendPulse not configured" and the admin can resend once it is.
 */
export const sendInvite = internalAction({
  args: { requestId: v.id("accessRequests") },
  handler: async (ctx, { requestId }): Promise<void> => {
    const token = inviteToken();
    const minted: { email: string } | null = await ctx.runMutation(internal.access.mintInvite, { requestId, tokenHash: await sha256Hex(token) });
    if (!minted) return;
    const base = (process.env.EYELORE_WEB_URL ?? "").replace(/\/$/, "");
    // without SendPulse keys the helper answers "not sent · SendPulse not configured" before anything else
    const keys = !!(process.env.SENDPULSE_CLIENT_ID && process.env.SENDPULSE_CLIENT_SECRET);
    const r = base || !keys
      ? await sendPulseEmail({
          to: minted.email,
          subject: "You're in · Eyecandid Pro",
          text: `Your Eyecandid Pro request is approved.\nSign in and start your subscription here: ${base}/pro/checkout?token=${token}\n\nThe link is yours; please don't share it.`,
          html: `<p>Your Eyecandid Pro request is approved.</p><p><a href="${escapeHtml(`${base}/pro/checkout?token=${token}`)}">Sign in and start your subscription</a></p><p>The link is yours; please don't share it.</p>`,
        })
      : ({ status: "not_sent", detail: "not sent · EYELORE_WEB_URL not set" } as const);
    await ctx.runMutation(internal.access.inviteFinish, { requestId, status: r.status, detail: r.detail });
  },
});

async function approvedByToken(ctx: QueryCtx, token: string) {
  if (!INVITE.test(token)) return null;
  const tokenHash = await sha256Hex(token);
  const row = await ctx.db.query("accessRequests").withIndex("by_inviteTokenHash", (q) => q.eq("inviteTokenHash", tokenHash)).unique();
  return row?.status === "approved" ? row : null;
}

const mask = (email: string) => {
  const [name, domain] = email.split("@");
  return `${(name ?? "").slice(0, 1)}•••@${domain ?? ""}`;
};

/** Is billing switched on at all: a Stripe key and a `billing` flag row that is on. */
async function billingSwitchedOn(ctx: QueryCtx) {
  if (!process.env.STRIPE_SECRET_KEY) return false;
  const row = await ctx.db.query("flags").withIndex("by_key", (q) => q.eq("key", "billing")).unique();
  return !!row?.enabled;
}

/** What /pro/checkout shows before sign-in: is the link good, and can payment be taken yet. */
export const invite = query({
  args: { token: v.string() },
  handler: async (ctx, { token }) => {
    const row = await approvedByToken(ctx, token);
    if (!row) return { valid: false as const };
    return { valid: true as const, email: mask(row.email), billing: await billingSwitchedOn(ctx) };
  },
});

export const proCheckoutContext = internalQuery({
  args: { token: v.string(), clerkId: v.optional(v.string()) },
  handler: async (ctx, { token, clerkId }) => {
    const row = await approvedByToken(ctx, token);
    if (!row) return null;
    const user = clerkId ? await userByClerkId(ctx, clerkId) : null;
    const ent = user ? await entitlementFor(ctx, user._id) : null;
    return {
      email: row.email,
      user: user ? { userId: user._id, email: user.email?.toLowerCase(), customerId: ent?.stripeCustomerId } : null,
      billingOn: user ? await flagOn(ctx, "billing", user._id) : false,
      alreadyPro: !!ent && isPlanId(ent.plan) && ent.plan !== "free" && ["active", "trialing"].includes(ent.subscriptionStatus ?? ""),
    };
  },
});

export type ProCheckoutResult =
  | { state: "invalid" }
  | { state: "billing_off" }
  | { state: "sign_in_required" }
  | { state: "wrong_account"; email: string }
  | { state: "already_pro" }
  | { state: "error" }
  | { state: "redirect"; url: string };

/**
 * Start Stripe Checkout for an approved request. The link proves the approval; the signed-in Clerk account must
 * have the approved email. Real when STRIPE_SECRET_KEY and the `billing` flag are on; otherwise "billing_off".
 */
export const proCheckout = action({
  args: { token: v.string() },
  handler: async (ctx, { token }): Promise<ProCheckoutResult> => {
    const identity = await ctx.auth.getUserIdentity();
    const c: {
      email: string;
      user: { userId: Id<"users">; email?: string; customerId?: string } | null;
      billingOn: boolean;
      alreadyPro: boolean;
    } | null = await ctx.runQuery(internal.access.proCheckoutContext, { token, clerkId: identity?.subject });
    if (!c) return { state: "invalid" };
    const key = process.env.STRIPE_SECRET_KEY;
    if (!key) return { state: "billing_off" };
    if (!identity || !c.user) return { state: "sign_in_required" };
    if (c.user.email !== c.email) return { state: "wrong_account", email: mask(c.email) };
    if (!c.billingOn) return { state: "billing_off" };
    if (c.alreadyPro) return { state: "already_pro" };
    const r = await createStripeCheckout(key, c.user, { plan: PRO_PLAN as "creator" | "studio", returnPath: "/pro/checkout" });
    if (!r.configured) return { state: "billing_off" };
    if (!r.ok) return { state: "error" };
    return { state: "redirect", url: r.url };
  },
});
