import { v } from "convex/values";
import { internalQuery } from "./_generated/server";

const MAX_PAGE = 500;

/**
 * Export stored editing labels for the eval harness (eval/README.md), oldest first, one bounded page per call.
 * Pass the returned `continueCursor` back until `isDone`. `kind` narrows to one label kind; `sinceAt`/`untilAt`
 * bound the window (ms). Rows carry no raw anon id: only anonHash/userId, projectId, and a source-clip span.
 */
export const exportLabels = internalQuery({
  args: {
    kind: v.optional(v.union(v.literal("restore"), v.literal("strike"), v.literal("pin"), v.literal("caption_edit"))),
    sinceAt: v.optional(v.number()),
    untilAt: v.optional(v.number()),
    cursor: v.optional(v.union(v.string(), v.null())),
    numItems: v.optional(v.number()),
  },
  handler: async (ctx, a) => {
    const numItems = Math.max(1, Math.min(Math.floor(a.numItems ?? 100), MAX_PAGE));
    const since = a.sinceAt ?? 0;
    const until = a.untilAt ?? Number.MAX_SAFE_INTEGER;
    const q = a.kind
      ? ctx.db.query("editLabels").withIndex("by_kind_at", (i) => i.eq("kind", a.kind!).gte("at", since).lte("at", until))
      : ctx.db.query("editLabels").filter((f) => f.and(f.gte(f.field("at"), since), f.lte(f.field("at"), until)));
    const r = await q.paginate({ numItems, cursor: a.cursor ?? null });
    return { page: r.page, continueCursor: r.continueCursor, isDone: r.isDone };
  },
});
