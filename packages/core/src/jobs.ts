import { z } from "zod";
import { Aspect } from "./editModel";

/**
 * Engine job contract — the ONLY interface between the app and the GPU (ADR 0003, 0004).
 * Each job type has a versioned input and output schema. Media is referenced by mediaId,
 * never by path; workers resolve it via POST /worker/download-url.
 */

const MediaRef = z.object({ mediaId: z.string().min(1) });
const Ms = z.number().int().nonnegative();
const WordTiming = z.object({ text: z.string(), startMs: Ms, endMs: Ms, conf: z.number().min(0).max(1) });

export const JOB_SPECS = {
  hello: {
    version: 1,
    input: z.object({ message: z.string().max(200), steps: z.number().int().min(1).max(20).default(5) }),
    output: z.object({ echo: z.string(), worker: z.string(), provider: z.string() }),
  },
  transcribe: {
    version: 1,
    input: MediaRef.extend({ language: z.string().optional(), model: z.enum(["small", "medium", "large-v3"]).default("small") }),
    output: z.object({ language: z.string(), words: z.array(WordTiming), durationMs: Ms }),
  },
  autocut: {
    version: 1,
    input: z.object({
      words: z.array(WordTiming),
      minSilenceMs: Ms.default(450),
      fillers: z.array(z.string()).default(["um", "uh", "erm", "like", "you know", "so", "basically"]),
    }),
    output: z.object({
      strikes: z.array(z.object({ startMs: Ms, endMs: Ms, kind: z.enum(["filler", "silence", "repeat"]), reason: z.string() })),
      beads: z.array(z.object({ inMs: Ms, outMs: Ms, moment: z.enum(["hook", "best", "cta"]).optional() })),
    }),
  },
  reframe: {
    version: 1,
    input: MediaRef.extend({ aspects: z.array(Aspect).min(1) }),
    output: z.object({
      tracks: z.array(z.object({ aspect: Aspect, keyframes: z.array(z.object({ ms: Ms, cx: z.number(), cy: z.number(), scale: z.number() })) })),
    }),
  },
  still: {
    version: 1,
    input: z.object({ prompt: z.string(), refMediaIds: z.array(z.string()).default([]), w: z.number().int(), h: z.number().int(), seed: z.number().int().optional() }),
    output: MediaRef,
  },
  i2v: {
    version: 1,
    input: MediaRef.extend({ prompt: z.string(), durationMs: Ms, lastFrameMediaId: z.string().optional(), seed: z.number().int().optional() }),
    output: MediaRef,
  },
  t2v: {
    version: 1,
    input: z.object({ prompt: z.string(), durationMs: Ms, aspect: Aspect, seed: z.number().int().optional() }),
    output: MediaRef,
  },
  voice: {
    version: 1,
    input: z.object({ text: z.string(), voiceId: z.string(), consentId: z.string().min(1) }),
    output: MediaRef.extend({ words: z.array(WordTiming) }),
  },
  matte: {
    version: 1,
    input: MediaRef.extend({ prompt: z.string().optional(), points: z.array(z.object({ ms: Ms, x: z.number(), y: z.number() })).default([]) }),
    output: MediaRef,
  },
  inpaint: {
    version: 1,
    input: MediaRef.extend({ maskMediaId: z.string(), instruction: z.string() }),
    output: MediaRef,
  },
  grade: {
    version: 1,
    input: MediaRef.extend({ look: z.string(), refMediaId: z.string().optional() }),
    output: MediaRef.extend({ lut: z.string().optional() }),
  },
  render: {
    version: 1,
    input: z.object({ projectId: z.string(), docVersion: z.number().int(), aspect: Aspect, watermark: z.boolean(), maxDurationMs: Ms.optional() }),
    output: MediaRef.extend({ durationMs: Ms, qc: z.object({ freezes: z.number().int(), silentAudio: z.boolean(), lufs: z.number() }) }),
  },
} as const;

export type JobType = keyof typeof JOB_SPECS;
export const JOB_TYPES = Object.keys(JOB_SPECS) as JobType[];
export const JobTypeSchema = z.enum(JOB_TYPES as [JobType, ...JobType[]]);

export type JobInput<T extends JobType> = z.input<(typeof JOB_SPECS)[T]["input"]>;
export type JobOutput<T extends JobType> = z.infer<(typeof JOB_SPECS)[T]["output"]>;

export const JobStatus = z.enum(["queued", "leased", "running", "succeeded", "failed", "canceled"]);
export type JobStatus = z.infer<typeof JobStatus>;

export const DEFAULT_LEASE_MS = 60_000;
export const MAX_LEASE_MS = 10 * 60_000;
export const DEFAULT_MAX_ATTEMPTS = 3;

export function parseJobInput<T extends JobType>(type: T, input: unknown): z.infer<(typeof JOB_SPECS)[T]["input"]> {
  return JOB_SPECS[type].input.parse(input) as z.infer<(typeof JOB_SPECS)[T]["input"]>;
}
export function parseJobOutput<T extends JobType>(type: T, output: unknown): JobOutput<T> {
  return JOB_SPECS[type].output.parse(output) as JobOutput<T>;
}

/** Wire shapes for the worker HTTP API. */
export const ClaimRequest = z.object({
  types: z.array(JobTypeSchema).min(1),
  versions: z.record(z.string(), z.number().int()).optional(),
  leaseMs: z.number().int().min(5_000).max(MAX_LEASE_MS).optional(),
});
export const ClaimedJob = z.object({
  id: z.string(),
  type: JobTypeSchema,
  version: z.number().int(),
  idempotencyKey: z.string(),
  input: z.unknown(),
  attempt: z.number().int(),
  leaseExpiresAt: z.number(),
});
export const HeartbeatRequest = z.object({ jobId: z.string() });
export const ProgressRequest = z.object({
  jobId: z.string(),
  progress: z.number().min(0).max(1),
  stage: z.string().max(80),
  previewMediaId: z.string().optional(),
});
export const CompleteRequest = z.object({ jobId: z.string(), output: z.unknown() });
export const FailRequest = z.object({ jobId: z.string(), error: z.string().max(2000), retryable: z.boolean().default(true) });
export const UploadUrlRequest = z.object({ contentType: z.string() });
export const DownloadUrlRequest = z.object({ mediaId: z.string() });

export const CONTRACT = {
  name: "eyelore-engine",
  /** bump when the envelope or HTTP API changes (not per job type) */
  apiVersion: 1,
} as const;
