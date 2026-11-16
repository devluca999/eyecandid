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

/** Resolve the calling worker from its bearer token, or null. Tokens are stored only as SHA-256. */
export async function authWorker(ctx: ActionCtx, req: Request): Promise<Id<"workers"> | null> {
  const h = req.headers.get("authorization") ?? "";
  const m = /^Bearer\s+(elw_[0-9a-f]{64})$/.exec(h);
  if (!m) return null;
  return await ctx.runMutation(internal.workers.touch, { tokenHash: await sha256Hex(m[1]!) });
}
