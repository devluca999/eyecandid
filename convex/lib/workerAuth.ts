import type { ActionCtx } from "../_generated/server";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";

export async function sha256Hex(s: string): Promise<string> {
  const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function randomToken(bytes = 32): string {
  const a = new Uint8Array(bytes);
  crypto.getRandomValues(a);
  return "elw_" + [...a].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time compare: both sides are hashed to equal length, then XOR-folded without early exit. */
export async function tokensMatch(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256Hex(given), sha256Hex(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/**
 * The owner's admin gate for /funnel and /admin/access: EYELORE_ADMIN_TOKEN on the Convex deployment.
 * "unconfigured" when the env var is missing, "denied" on a wrong token.
 */
export async function adminGate(token: string): Promise<"ok" | "unconfigured" | "denied"> {
  const expected = process.env.EYELORE_ADMIN_TOKEN;
  if (!expected) return "unconfigured";
  return (await tokensMatch(token, expected)) ? "ok" : "denied";
}

/** Resolve the calling worker from its bearer token, or null. Tokens are stored only as SHA-256. */
export async function authWorker(ctx: ActionCtx, req: Request): Promise<Id<"workers"> | null> {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(elw_[0-9a-f]{64})$/.exec(h);
  if (!m) return null;
  return await ctx.runMutation(internal.workers.touch, { tokenHash: await sha256Hex(m[1]!) });
}
