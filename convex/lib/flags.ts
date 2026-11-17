import { evaluateFlag } from "@eyelore/core";
import type { FlagKey } from "@eyelore/core";
import type { MutationCtx, QueryCtx } from "../_generated/server";

/** Server-side flag check (ADR 0007). Unknown or missing rows are off. */
export async function flagOn(ctx: QueryCtx | MutationCtx, key: FlagKey, subject: string): Promise<boolean> {
  const row = await ctx.db.query("flags").withIndex("by_key", (q) => q.eq("key", key)).unique();
  return evaluateFlag(row, subject);
}
