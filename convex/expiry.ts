import { v } from "convex/values";
import { internalMutation } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import { mediaStore } from "./lib/mediaStore";

/**
 * Storage hygiene (mvp-spec "Low-cost architecture" 5): raw uploads and proxies expire after 7 days (Free) or 30 days
 * (Pro), render exports after 30 days. Bytes go through MediaStore.delete and the media row goes with them; edit
 * docs are left alone. A daily cron starts the sweep; each run handles one bounded page and schedules the next.
 *
 * Owner unknown (worker-registered proxies carry no project): treated as Pro, i.e. the longer 30 days.
 */
const DAY = 24 * 60 * 60 * 1000;
export const FREE_RAW_DAYS = 7;
export const PRO_RAW_DAYS = 30;
export const EXPORT_DAYS = 30;
const DEFAULT_BATCH = 100;

const STAGES = ["source", "proxy", "render", "limits"] as const;
type Stage = (typeof STAGES)[number];

async function isPro(ctx: MutationCtx, projectId: Id<"projects"> | undefined, cache: Map<string, boolean>): Promise<boolean> {
  if (!projectId) return true;
  const hit = cache.get(projectId);
  if (hit !== undefined) return hit;
  const project = await ctx.db.get(projectId);
  let pro = false;
  if (project?.ownerUserId) {
    const ent = await ctx.db.query("entitlements").withIndex("by_user", (q) => q.eq("userId", project.ownerUserId!)).unique();
    pro = !!ent && ent.plan !== "free";
  }
  cache.set(projectId, pro);
  return pro;
}

export const sweep = internalMutation({
  args: { stage: v.optional(v.string()), cursor: v.optional(v.union(v.string(), v.null())), batch: v.optional(v.number()) },
  handler: async (ctx, { stage: s, cursor, batch }) => {
    const stage: Stage = (STAGES as readonly string[]).includes(s ?? "") ? (s as Stage) : "source";
    const numItems = Math.max(1, Math.min(batch ?? DEFAULT_BATCH, 500));
    const now = Date.now();
    let page: { isDone: boolean; continueCursor: string };
    let deleted = 0;

    if (stage === "limits") {
      // rate-limit counters are hourly windows: anything older than a day is dead weight
      const r = await ctx.db.query("rateLimits").withIndex("by_window", (q) => q.lt("windowStart", now - DAY)).paginate({ numItems, cursor: cursor ?? null });
      for (const row of r.page) await ctx.db.delete(row._id);
      deleted = r.page.length;
      page = r;
    } else {
      // never look past the earliest possible expiry; Pro rows inside their window are skipped, not revisited next page
      const horizon = now - (stage === "render" ? EXPORT_DAYS : FREE_RAW_DAYS) * DAY;
      const r = await ctx.db.query("media").withIndex("by_kind_created", (q) => q.eq("kind", stage).lt("createdAt", horizon)).paginate({ numItems, cursor: cursor ?? null });
      const cache = new Map<string, boolean>();
      for (const m of r.page) {
        const keepDays = stage === "render" ? EXPORT_DAYS : (await isPro(ctx, m.projectId, cache)) ? PRO_RAW_DAYS : FREE_RAW_DAYS;
        if (m.createdAt >= now - keepDays * DAY) continue;
        await mediaStore.delete(ctx, m);
        await ctx.db.delete(m._id);
        deleted++;
      }
      page = r;
    }

    if (!page.isDone) await ctx.scheduler.runAfter(0, internal.expiry.sweep, { stage, cursor: page.continueCursor, batch });
    else if (stage !== "limits") await ctx.scheduler.runAfter(0, internal.expiry.sweep, { stage: STAGES[STAGES.indexOf(stage) + 1], batch });
    return { stage, deleted, done: page.isDone };
  },
});
