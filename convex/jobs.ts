import { v } from "convex/values";
import { internalMutation, mutation, query } from "./_generated/server";
import type { MutationCtx } from "./_generated/server";
import type { Doc, Id } from "./_generated/dataModel";
import { JOB_SPECS, JobTypeSchema, DEFAULT_LEASE_MS, DEFAULT_MAX_ATTEMPTS, MAX_LEASE_MS, evaluateFlag } from "@eyelore/core";
import type { JobType } from "@eyelore/core";
import { caller, owns } from "./lib/owner";

/** Insert a job, validating input against the contract. Idempotent on idempotencyKey. */
export async function enqueueJob(
  ctx: MutationCtx,
  args: {
    type: JobType;
    input: unknown;
    idempotencyKey: string;
    projectId?: Id<"projects">;
    ownerUserId?: Id<"users">;
    ownerAnonId?: string;
    maxAttempts?: number;
  },
): Promise<Id<"jobs">> {
  const existing = await ctx.db
    .query("jobs")
    .withIndex("by_idempotency", (q) => q.eq("idempotencyKey", args.idempotencyKey))
    .first();
  if (existing) return existing._id;
  const spec = JOB_SPECS[args.type];
  const input = spec.input.parse(args.input);
  return await ctx.db.insert("jobs", {
    type: args.type,
    version: spec.version,
    idempotencyKey: args.idempotencyKey,
    input,
    status: "queued",
    progress: 0,
    stage: "queued",
    attempts: 0,
    maxAttempts: args.maxAttempts ?? DEFAULT_MAX_ATTEMPTS,
    projectId: args.projectId,
    ownerUserId: args.ownerUserId,
    ownerAnonId: args.ownerAnonId,
    createdAt: Date.now(),
  });
}

/** Phase 1 round-trip: enqueue a hello job from a client (behind the hello_job flag). */
export const enqueueHello = mutation({
  args: { anonId: v.string(), message: v.string(), requestId: v.string() },
  handler: async (ctx, { anonId, message, requestId }) => {
    const who = await caller(ctx, anonId);
    const flag = await ctx.db.query("flags").withIndex("by_key", (q) => q.eq("key", "hello_job")).unique();
    // default-on when the row doesn't exist yet, so a fresh deployment can prove the round-trip
    if (flag && !evaluateFlag(flag, who.userId ?? anonId)) throw new Error("hello_job is off");
    return await enqueueJob(ctx, {
      type: "hello",
      input: { message: message.slice(0, 200), steps: 5 },
      idempotencyKey: `hello:${anonId}:${requestId}`,
      ownerUserId: who.userId,
      ownerAnonId: anonId,
      maxAttempts: 2,
    });
  },
});

export type PublicJob = Pick<Doc<"jobs">, "_id" | "type" | "status" | "progress" | "stage" | "output" | "error" | "attempts" | "createdAt" | "startedAt" | "finishedAt">;

/** Live job status for its owner. */
export const get = query({
  args: { jobId: v.id("jobs"), anonId: v.optional(v.string()) },
  handler: async (ctx, { jobId, anonId }): Promise<PublicJob | null> => {
    const job = await ctx.db.get(jobId);
    if (!job) return null;
    if (!owns(job, await caller(ctx, anonId))) return null;
    const { _id, type, status, progress, stage, output, error, attempts, createdAt, startedAt, finishedAt } = job;
    return { _id, type, status, progress, stage, output, error, attempts, createdAt, startedAt, finishedAt };
  },
});

/** Is any worker alive? Used to say honestly when the GPU is cold. */
export const workerPresence = query({
  args: {},
  handler: async (ctx) => {
    const recent = await ctx.db.query("workers").order("desc").take(50);
    const now = Date.now();
    const live = recent.filter((w) => !w.disabled && w.lastSeenAt && now - w.lastSeenAt < 60_000);
    return { live: live.length, providers: [...new Set(live.map((w) => w.provider))] };
  },
});

// ───────────── worker side (called only from http.ts after token auth) ─────────────

const CLAIMABLE = ["queued"] as const;

export const claim = internalMutation({
  args: { workerId: v.id("workers"), types: v.array(v.string()), leaseMs: v.optional(v.number()) },
  handler: async (ctx, { workerId, types, leaseMs }) => {
    const lease = Math.min(Math.max(leaseMs ?? DEFAULT_LEASE_MS, 5_000), MAX_LEASE_MS);
    let oldest: Doc<"jobs"> | null = null;
    for (const t of types) {
      if (!JobTypeSchema.safeParse(t).success) continue;
      for (const s of CLAIMABLE) {
        const j = await ctx.db
          .query("jobs")
          .withIndex("by_status_type_created", (q) => q.eq("status", s).eq("type", t))
          .order("asc")
          .first();
        if (j && (!oldest || j.createdAt < oldest.createdAt)) oldest = j;
      }
    }
    if (!oldest) return null;
    const now = Date.now();
    const leaseExpiresAt = now + lease;
    const attempt = oldest.attempts + 1;
    await ctx.db.patch(oldest._id, {
      status: "leased",
      leaseOwner: workerId,
      leaseExpiresAt,
      attempts: attempt,
      stage: "starting",
      startedAt: oldest.startedAt ?? now,
    });
    return {
      id: oldest._id as string,
      type: oldest.type,
      version: oldest.version,
      idempotencyKey: oldest.idempotencyKey,
      input: oldest.input,
      attempt,
      leaseExpiresAt,
    };
  },
});

async function ownedActive(ctx: MutationCtx, jobId: string, workerId: Id<"workers">) {
  const id = ctx.db.normalizeId("jobs", jobId);
  if (!id) return null;
  const job = await ctx.db.get(id);
  if (!job || job.leaseOwner !== workerId) return null;
  if (job.status !== "leased" && job.status !== "running") return null;
  return job;
}

export const heartbeat = internalMutation({
  args: { workerId: v.id("workers"), jobId: v.string(), leaseMs: v.optional(v.number()) },
  handler: async (ctx, { workerId, jobId, leaseMs }) => {
    const job = await ownedActive(ctx, jobId, workerId);
    if (!job) return null;
    const leaseExpiresAt = Date.now() + Math.min(leaseMs ?? DEFAULT_LEASE_MS, MAX_LEASE_MS);
    await ctx.db.patch(job._id, { leaseExpiresAt });
    return leaseExpiresAt;
  },
});

export const progress = internalMutation({
  args: { workerId: v.id("workers"), jobId: v.string(), progress: v.number(), stage: v.string() },
  handler: async (ctx, { workerId, jobId, progress, stage }) => {
    const job = await ownedActive(ctx, jobId, workerId);
    if (!job) return false;
    await ctx.db.patch(job._id, {
      status: "running",
      progress: Math.max(job.progress, Math.min(1, Math.max(0, progress))),
      stage: stage.slice(0, 80),
      leaseExpiresAt: Math.max(job.leaseExpiresAt ?? 0, Date.now() + DEFAULT_LEASE_MS),
    });
    return true;
  },
});

export const complete = internalMutation({
  args: { workerId: v.id("workers"), jobId: v.string(), output: v.any() },
  handler: async (ctx, { workerId, jobId, output }) => {
    const job = await ownedActive(ctx, jobId, workerId);
    if (!job) return { ok: false as const, error: "stale lease" };
    const parsed = JOB_SPECS[job.type as JobType].output.safeParse(output);
    if (!parsed.success) {
      await ctx.db.patch(job._id, { status: "failed", error: `output failed contract: ${parsed.error.message.slice(0, 500)}`, finishedAt: Date.now(), leaseOwner: undefined, leaseExpiresAt: undefined });
      return { ok: false as const, error: "output failed contract" };
    }
    await ctx.db.patch(job._id, {
      status: "succeeded",
      output: parsed.data,
      progress: 1,
      stage: "done",
      finishedAt: Date.now(),
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
    });
    return { ok: true as const };
  },
});

export const fail = internalMutation({
  args: { workerId: v.id("workers"), jobId: v.string(), error: v.string(), retryable: v.boolean() },
  handler: async (ctx, { workerId, jobId, error, retryable }) => {
    const job = await ownedActive(ctx, jobId, workerId);
    if (!job) return false;
    const retry = retryable && job.attempts < job.maxAttempts;
    await ctx.db.patch(job._id, {
      status: retry ? "queued" : "failed",
      stage: retry ? "retrying" : "failed",
      error: error.slice(0, 2000),
      leaseOwner: undefined,
      leaseExpiresAt: undefined,
      finishedAt: retry ? undefined : Date.now(),
    });
    return true;
  },
});

/** Cron: requeue jobs whose lease expired without a heartbeat (or fail them after maxAttempts). */
export const requeueExpired = internalMutation({
  args: {},
  handler: async (ctx) => {
    const now = Date.now();
    let n = 0;
    for (const status of ["leased", "running"] as const) {
      const expired = await ctx.db
        .query("jobs")
        .withIndex("by_status_lease", (q) => q.eq("status", status).lt("leaseExpiresAt", now))
        .take(100);
      for (const job of expired) {
        const retry = job.attempts < job.maxAttempts;
        await ctx.db.patch(job._id, {
          status: retry ? "queued" : "failed",
          stage: retry ? "requeued · lease expired" : "failed · lease expired",
          error: "lease expired",
          leaseOwner: undefined,
          leaseExpiresAt: undefined,
          finishedAt: retry ? undefined : now,
        });
        n++;
      }
    }
    return n;
  },
});
