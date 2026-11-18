import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalQuery } from "./_generated/server";
import { reportError } from "./lib/sentry";

/** Report a job that failed for good. Scheduled from jobs.fail only when SENTRY_DSN is set. */
export const jobFailed = internalAction({
  args: { type: v.string(), error: v.string(), attempts: v.number() },
  handler: async (_ctx, { type, error, attempts }) => {
    await reportError(`job failed · ${type} · ${error}`, { jobType: type, attempts: String(attempts), source: "convex.jobs.fail" });
  },
});

export interface JobCounts {
  succeeded: number;
  failed: number;
}

/** Alert only with enough jobs to mean something (3 failures of 3 overnight page nobody) and a rate above the threshold. */
export function failureRateVerdict(
  { succeeded, failed }: JobCounts,
  { minJobs = 20, threshold = 0.05 }: { minJobs?: number; threshold?: number } = {},
): { rate: number; alert: boolean } {
  const total = succeeded + failed;
  const rate = total === 0 ? 0 : failed / total;
  return { rate, alert: total >= minJobs && rate > threshold };
}

export const FAILURE_WINDOW_MS = 60 * 60 * 1000;
const RECENT_JOBS = 500;

/**
 * Jobs that finished in the last hour, by status. No index on `jobs` is bounded by finishedAt (by_status_type_created
 * is keyed on createdAt), so read the most recent 500 jobs, newest first, and filter on finishedAt. Canceled and
 * unfinished jobs count as neither. If more than 500 jobs are created in an hour the count covers only the newest 500.
 */
export const recentOutcomes = internalQuery({
  args: { now: v.optional(v.number()) },
  handler: async (ctx, { now }): Promise<JobCounts> => {
    const since = (now ?? Date.now()) - FAILURE_WINDOW_MS;
    const recent = await ctx.db.query("jobs").order("desc").take(RECENT_JOBS);
    let succeeded = 0;
    let failed = 0;
    for (const j of recent) {
      if (j.finishedAt === undefined || j.finishedAt < since) continue;
      if (j.status === "succeeded") succeeded++;
      else if (j.status === "failed") failed++;
    }
    return { succeeded, failed };
  },
});

/** Hourly: one Sentry event when the last hour's failure rate is over the threshold. No SENTRY_DSN: does nothing. */
export const failureRate = internalAction({
  args: {},
  handler: async (ctx): Promise<{ rate: number; alert: boolean; sent: boolean }> => {
    const counts: JobCounts = await ctx.runQuery(internal.sentry.recentOutcomes, {});
    const verdict = failureRateVerdict(counts);
    if (!verdict.alert || !process.env.SENTRY_DSN) return { ...verdict, sent: false };
    const total = counts.succeeded + counts.failed;
    const sent = await reportError(
      `job failure rate ${Math.round(verdict.rate * 100)}% in the last hour (${counts.failed} of ${total})`,
      { failed: String(counts.failed), succeeded: String(counts.succeeded), source: "convex.sentry.failureRate" },
      fetch,
      ["job failure rate"],
    );
    return { ...verdict, sent };
  },
});
