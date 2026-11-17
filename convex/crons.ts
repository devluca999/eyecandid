import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();
crons.interval("requeue expired job leases", { minutes: 1 }, internal.jobs.requeueExpired, {});
// safety net for scale-to-zero workers: a job that is still waiting with no worker polling gets the engine woken
crons.interval("wake the engine for waiting jobs", { minutes: 1 }, internal.wake.check, {});
export default crons;
