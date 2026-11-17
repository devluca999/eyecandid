import { v } from "convex/values";
import { internalAction } from "./_generated/server";
import { reportError } from "./lib/sentry";

/** Report a job that failed for good. Scheduled from jobs.fail only when SENTRY_DSN is set. */
export const jobFailed = internalAction({
  args: { type: v.string(), error: v.string(), attempts: v.number() },
  handler: async (_ctx, { type, error, attempts }) => {
    await reportError(`job failed · ${type} · ${error}`, { jobType: type, attempts: String(attempts), source: "convex.jobs.fail" });
  },
});
