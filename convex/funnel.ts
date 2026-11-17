import { ConvexError, v } from "convex/values";
import { query } from "./_generated/server";
import { FUNNEL, aggregateFunnel, costSummary, parseRate, type FunnelEventRow } from "@eyelore/core";
import { sha256Hex } from "./lib/workerAuth";

/**
 * Rows read per event name. Convex caps a query at 16,384 documents, and 11 steps are read, so the bound is
 * 1,400 (+1 to detect overflow): 11 * 1,401 = 15,411. The newest rows win; a step that overflows is `truncated`.
 */
export const FUNNEL_ROW_LIMIT = 1400;

const DAY_MS = 86_400_000;
/** the free pipeline's job types (all CPU); GPU types are paid with credits and aren't part of the free cost */
const CPU_TYPES = ["transcribe", "autocut", "reframe", "render"] as const;
const COST_ROW_LIMIT = 500;

/** Constant-time compare: both sides are hashed to equal length, then XOR-folded without early exit. */
async function tokensMatch(given: string, expected: string): Promise<boolean> {
  const [a, b] = await Promise.all([sha256Hex(given), sha256Hex(expected)]);
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

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
    // cost per free edit (Phase 3): worker seconds on the CPU pipeline × the owner's rate, over exports in the window
    const jobs = [];
    for (const type of CPU_TYPES)
      for (const status of ["succeeded", "failed"] as const)
        jobs.push(...(await ctx.db.query("jobs").withIndex("by_status_type_created", (q) => q.eq("status", status).eq("type", type).gte("createdAt", since)).take(COST_ROW_LIMIT)));
    const exports = (await ctx.db.query("exports").order("desc").take(COST_ROW_LIMIT)).filter((e) => e.createdAt >= since);
    const cost = costSummary({ jobs, exports: exports.map((e) => ({ device: !!e.device })), usdPerHour: parseRate(process.env.EYELORE_CPU_USD_PER_HOUR) });
    return { configured: true as const, days, since, until: now, rowLimit: FUNNEL_ROW_LIMIT, ...aggregateFunnel({ rows, truncated }), cost };
  },
});
