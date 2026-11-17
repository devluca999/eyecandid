import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { FUNNEL, aggregateFunnel, type FunnelEventRow } from "@eyelore/core";
import { tokensMatch } from "./lib/workerAuth";

/**
 * Rows read per event name. Convex caps a query at 16,384 documents, and 11 steps are read, so the bound is
 * 1,400 (+1 to detect overflow): 11 * 1,401 = 15,411. The newest rows win; a step that overflows is `truncated`.
 */
export const FUNNEL_ROW_LIMIT = 1400;

const DAY_MS = 86_400_000;

/** Token-gated funnel summary for /funnel. Reads via `by_name_ts`, bounded per event name; never scans the table. */
export const summary = query({
  args: { token: v.string(), days: v.union(v.literal(1), v.literal(7), v.literal(30)) },
  handler: async (ctx, { token, days }) => {
    const expected = process.env.EYELORE_ADMIN_TOKEN;
    if (!expected) return { configured: false as const };
    if (!(await tokensMatch(token, expected))) throw new ConvexError("not allowed");

    const now = Date.now();
    const since = now - days * DAY_MS;
    const rows: Record<string, FunnelEventRow[]> = {};
    const truncated: Record<string, boolean> = {};
    for (const name of FUNNEL) {
      const got = await ctx.db
        .query("events")
        .withIndex("by_name_ts", (q) => q.eq("name", name).gte("ts", since))
        .order("desc")
        .take(FUNNEL_ROW_LIMIT + 1);
      truncated[name] = got.length > FUNNEL_ROW_LIMIT;
      rows[name] = got.slice(0, FUNNEL_ROW_LIMIT).map((e) => ({ anonHash: e.anonHash, userId: e.userId, props: e.props }));
    }
    return { configured: true as const, days, since, until: now, rowLimit: FUNNEL_ROW_LIMIT, ...aggregateFunnel({ rows, truncated }) };
  },
});
