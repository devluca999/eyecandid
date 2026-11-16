import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import type { ActionCtx } from "./_generated/server";
import { internal } from "./_generated/api";
import type { Id } from "./_generated/dataModel";
import { z } from "zod";
import {
  ClaimRequest,
  CompleteRequest,
  DownloadUrlRequest,
  FailRequest,
  HeartbeatRequest,
  ProgressRequest,
  UploadUrlRequest,
  CONTRACT,
} from "@eyelore/core";
import { authWorker } from "./lib/workerAuth";

const http = httpRouter();

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

/** Wrap a worker route: bearer auth, zod body validation, uniform errors. */
function workerRoute<S extends z.ZodType>(
  schema: S,
  fn: (ctx: ActionCtx, workerId: Id<"workers">, body: z.infer<S>) => Promise<Response>,
) {
  return httpAction(async (ctx, req) => {
    const workerId = await authWorker(ctx, req);
    if (!workerId) return json({ error: "unauthorized" }, 401);
    let raw: unknown;
    try {
      raw = await req.json();
    } catch {
      return json({ error: "invalid json" }, 400);
    }
    const parsed = schema.safeParse(raw);
    if (!parsed.success) return json({ error: "invalid body", issues: parsed.error.issues.slice(0, 5) }, 400);
    return await fn(ctx, workerId, parsed.data);
  });
}

http.route({
  path: "/worker/hello",
  method: "GET",
  handler: httpAction(async () => json({ ...CONTRACT, ok: true })),
});

http.route({
  path: "/worker/claim",
  method: "POST",
  handler: workerRoute(ClaimRequest, async (ctx, workerId, b) => {
    const job = await ctx.runMutation(internal.jobs.claim, { workerId, types: b.types, leaseMs: b.leaseMs });
    return job ? json({ job }) : new Response(null, { status: 204 });
  }),
});

http.route({
  path: "/worker/heartbeat",
  method: "POST",
  handler: workerRoute(HeartbeatRequest, async (ctx, workerId, b) => {
    const leaseExpiresAt = await ctx.runMutation(internal.jobs.heartbeat, { workerId, jobId: b.jobId });
    return leaseExpiresAt ? json({ leaseExpiresAt }) : json({ error: "stale lease" }, 409);
  }),
});

http.route({
  path: "/worker/progress",
  method: "POST",
  handler: workerRoute(ProgressRequest, async (ctx, workerId, b) => {
    const ok = await ctx.runMutation(internal.jobs.progress, { workerId, jobId: b.jobId, progress: b.progress, stage: b.stage });
    return ok ? json({ ok }) : json({ error: "stale lease" }, 409);
  }),
});

http.route({
  path: "/worker/complete",
  method: "POST",
  handler: workerRoute(CompleteRequest, async (ctx, workerId, b) => {
    const r = await ctx.runMutation(internal.jobs.complete, { workerId, jobId: b.jobId, output: b.output });
    return r.ok ? json({ ok: true }) : json({ error: r.error }, 409);
  }),
});

http.route({
  path: "/worker/fail",
  method: "POST",
  handler: workerRoute(FailRequest, async (ctx, workerId, b) => {
    const ok = await ctx.runMutation(internal.jobs.fail, { workerId, jobId: b.jobId, error: b.error, retryable: b.retryable });
    return ok ? json({ ok }) : json({ error: "stale lease" }, 409);
  }),
});

http.route({
  path: "/worker/upload-url",
  method: "POST",
  handler: workerRoute(UploadUrlRequest, async (ctx) => {
    const uploadUrl = await ctx.storage.generateUploadUrl();
    return json({ uploadUrl });
  }),
});

http.route({
  path: "/worker/register-media",
  method: "POST",
  handler: workerRoute(
    z.object({ storageId: z.string(), contentType: z.string(), kind: z.enum(["generated", "render", "preview", "proxy"]) }),
    async (ctx, _w, b) => {
      const mediaId = await ctx.runMutation(internal.media.registerFromWorker, b);
      return json({ mediaId });
    },
  ),
});

http.route({
  path: "/worker/download-url",
  method: "POST",
  handler: workerRoute(DownloadUrlRequest, async (ctx, _w, b) => {
    const url = await ctx.runQuery(internal.media.downloadUrl, { mediaId: b.mediaId });
    return url ? json({ url }) : json({ error: "not found" }, 404);
  }),
});

export default http;
