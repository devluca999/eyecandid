import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export const jobStatus = v.union(
  v.literal("queued"),
  v.literal("leased"),
  v.literal("running"),
  v.literal("succeeded"),
  v.literal("failed"),
  v.literal("canceled"),
);

export default defineSchema({
  users: defineTable({
    clerkId: v.string(),
    email: v.optional(v.string()),
    plan: v.union(v.literal("free"), v.literal("creator"), v.literal("studio")),
    createdAt: v.number(),
  }).index("by_clerkId", ["clerkId"]),

  projects: defineTable({
    ownerUserId: v.optional(v.id("users")),
    ownerAnonId: v.optional(v.string()),
    title: v.string(),
    headVersion: v.number(),
    /** honest pipeline state for the UI: what is happening now, and how far along */
    stage: v.union(v.literal("empty"), v.literal("uploading"), v.literal("transcribing"), v.literal("cutting"), v.literal("reframing"), v.literal("ready"), v.literal("failed")),
    stageDetail: v.optional(v.string()),
    createdAt: v.number(),
    readyAt: v.optional(v.number()),
  })
    .index("by_owner_user", ["ownerUserId"])
    .index("by_owner_anon", ["ownerAnonId"]),

  /** head snapshot of the edit model (one row per project) — ADR 0002. History is the editOps log. */
  editDocs: defineTable({
    projectId: v.id("projects"),
    version: v.number(),
    doc: v.any(),
  }).index("by_project", ["projectId"]),

  /** append-only change log: every op with its one-line reason */
  editOps: defineTable({
    projectId: v.id("projects"),
    version: v.number(),
    ops: v.any(),
    reason: v.string(),
    actor: v.string(),
    at: v.number(),
    /** set when a user change has been undone (undo walks back through these, newest first) */
    undone: v.optional(v.boolean()),
  }).index("by_project_version", ["projectId", "version"]),

  media: defineTable({
    projectId: v.optional(v.id("projects")),
    kind: v.union(v.literal("source"), v.literal("proxy"), v.literal("generated"), v.literal("render"), v.literal("preview")),
    storage: v.object({ provider: v.union(v.literal("convex"), v.literal("s3")), key: v.string() }),
    contentType: v.string(),
    bytes: v.optional(v.number()),
    w: v.optional(v.number()),
    h: v.optional(v.number()),
    durationMs: v.optional(v.number()),
    /** for proxies: the source media this is a low-res copy of */
    proxyOf: v.optional(v.id("media")),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),

  exports: defineTable({
    projectId: v.id("projects"),
    jobId: v.id("jobs"),
    aspect: v.string(),
    maxDurationMs: v.optional(v.number()),
    watermark: v.boolean(),
    docVersion: v.number(),
    createdAt: v.number(),
  }).index("by_project", ["projectId"]),

  jobs: defineTable({
    type: v.string(),
    version: v.number(),
    idempotencyKey: v.string(),
    input: v.any(),
    output: v.optional(v.any()),
    status: jobStatus,
    progress: v.number(),
    stage: v.string(),
    previewMediaId: v.optional(v.id("media")),
    attempts: v.number(),
    maxAttempts: v.number(),
    leaseOwner: v.optional(v.id("workers")),
    leaseExpiresAt: v.optional(v.number()),
    projectId: v.optional(v.id("projects")),
    /** pipeline bookkeeping, e.g. { clipId } — not part of the engine contract */
    meta: v.optional(v.any()),
    ownerUserId: v.optional(v.id("users")),
    ownerAnonId: v.optional(v.string()),
    error: v.optional(v.string()),
    createdAt: v.number(),
    startedAt: v.optional(v.number()),
    finishedAt: v.optional(v.number()),
  })
    .index("by_status_type_created", ["status", "type", "createdAt"])
    .index("by_status_lease", ["status", "leaseExpiresAt"])
    .index("by_idempotency", ["idempotencyKey"])
    .index("by_project", ["projectId"])
    .index("by_owner_anon", ["ownerAnonId"]),

  workers: defineTable({
    name: v.string(),
    tokenHash: v.string(),
    provider: v.string(),
    lastSeenAt: v.optional(v.number()),
    disabled: v.boolean(),
    createdAt: v.number(),
  }).index("by_tokenHash", ["tokenHash"]),

  events: defineTable({
    name: v.string(),
    /** SHA-256 of the anon id: the raw id is a capability token and is never stored in analytics (ADR 0006) */
    anonHash: v.optional(v.string()),
    userId: v.optional(v.id("users")),
    props: v.any(),
    ts: v.number(),
  })
    .index("by_name_ts", ["name", "ts"])
    .index("by_anon", ["anonHash"]),

  flags: defineTable({
    key: v.string(),
    enabled: v.boolean(),
    rolloutPct: v.number(),
    allow: v.array(v.string()),
  }).index("by_key", ["key"]),

  entitlements: defineTable({
    userId: v.id("users"),
    plan: v.string(),
    minutesUsed: v.number(),
    minutesLimit: v.number(),
    credits: v.number(),
    watermark: v.boolean(),
  }).index("by_user", ["userId"]),

  stripeEvents: defineTable({ eventId: v.string(), at: v.number() }).index("by_eventId", ["eventId"]),
});
