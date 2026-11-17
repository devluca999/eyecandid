import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("requeue expired job leases", { minutes: 1 }, internal.jobs.requeueExpired, {});
// safety net for scale-to-zero workers: a job that is still waiting with no worker polling gets the engine woken
crons.interval("wake the engine for waiting jobs", { minutes: 1 }, internal.wake.check, {});
// storage hygiene: raw uploads and proxies expire after 7 days (Free) / 30 (Pro), exports after 30 (convex/expiry.ts)
crons.daily("expire old media", { hourUTC: 3, minuteUTC: 17 }, internal.expiry.sweep, {});
export default crons;
