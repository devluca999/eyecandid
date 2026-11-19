import { ConvexError, v } from "convex/values";
import { internalQuery, query } from "./_generated/server";
import { tokensMatch } from "./lib/workerAuth";

const DAY_MS = 86_400_000;
/** newest rows read per call (a query reads at most 16,384 documents; this stays far under it) */
export const SUMMARY_ROW_LIMIT = 2000;
const KINDS = ["restore", "strike", "pin", "caption_edit"] as const;

/**
 * Token-gated counts of stored labels (same EYELORE_ADMIN_TOKEN gate as /funnel). Reads the newest rows per kind via
 * `by_kind_at`, bounded; when a kind hits the bound the counts are "at least" (`truncated`). Tuning is still manual.
 */
export const summary = query({
  args: { token: v.string(), days: v.optional(v.number()) },
  handler: async (ctx, { token, days }) => {
    const expected = process.env.EYELORE_ADMIN_TOKEN;
    if (!expected) return { configured: false as const };
    if (!(await tokensMatch(token, expected))) throw new ConvexError("not allowed");

    const d = Math.min(Math.max(Math.floor(days ?? 30), 1), 365);
    const now = Date.now();
    const since = now - d * DAY_MS;
    const byKind: Record<string, number> = {};
    const byStrikeKind: Record<string, number> = {};
    let truncated = false;
    let total = 0;
    // per kind, so one busy kind cannot starve the others; each kind reads at most SUMMARY_ROW_LIMIT (+1 to detect overflow)
    for (const kind of KINDS) {
      const rows = await ctx.db
        .query("editLabels")
        .withIndex("by_kind_at", (q) => q.eq("kind", kind).gte("at", since))
        .order("desc")
        .take(SUMMARY_ROW_LIMIT + 1);
      if (rows.length > SUMMARY_ROW_LIMIT) truncated = true;
      const used = rows.slice(0, SUMMARY_ROW_LIMIT);
      byKind[kind] = used.length;
      total += used.length;
      for (const r of used) if (r.strikeKind) byStrikeKind[`${kind}:${r.strikeKind}`] = (byStrikeKind[`${kind}:${r.strikeKind}`] ?? 0) + 1;
    }
    return { configured: true as const, days: d, since, until: now, rowLimit: SUMMARY_ROW_LIMIT, total, byKind, byStrikeKind, truncated, atLeast: truncated };
  },
});

const EXPORT_DEFAULT = 200;
const EXPORT_MAX = 500;

/**
 * Page through stored labels for offline tuning. Internal: callable from the Convex dashboard or CLI
 * (`npx convex run labels:exportLabels`), never from a client. One bounded page per call (`limit` default 200, at most 500);
 * pass the returned `cursor` back until `done`. With `kind` it reads `by_kind_at` in time order; without, it scans the table
 * in write order (which is time order) and filters on `at`. Rows are exactly what the table holds: timings, kinds,
 * hashed owner, projectId, docVersion, at. No joins, no text.
 */
export const exportLabels = internalQuery({
  args: {
    kind: v.optional(v.union(v.literal("restore"), v.literal("strike"), v.literal("pin"), v.literal("caption_edit"))),
    sinceMs: v.optional(v.number()),
    untilMs: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const numItems = Math.max(1, Math.min(Math.floor(a.limit ?? EXPORT_DEFAULT), EXPORT_MAX));
    const since = a.sinceMs ?? 0;
    const until = a.untilMs ?? Number.MAX_SAFE_INTEGER;
    const q = a.kind
      ? ctx.db.query("editLabels").withIndex("by_kind_at", (i) => i.eq("kind", a.kind!).gte("at", since).lte("at", until))
      : ctx.db.query("editLabels").filter((f) => f.and(f.gte(f.field("at"), since), f.lte(f.field("at"), until)));
    const r = await q.paginate({ numItems, cursor: a.cursor ?? null });
    const rows = r.page.map(({ _id, _creationTime, ...row }) => ({ id: _id, ...row }));
    return { rows, cursor: r.continueCursor, done: r.isDone };
  },
});
