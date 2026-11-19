import { z } from "zod";

/** Typed funnel events. Writers: Convex `events.track` + Vercel Web Analytics. Provider-agnostic. */
export const FUNNEL = [
  "landing_view",
  "drop_started",
  "upload_done",
  "first_preview",
  "edit_interaction",
  "export_clicked",
  "signup_prompted",
  "signup_done",
  "paywall_shown",
  "export_done",
  "share",
] as const;

/**
 * Side events counted on /funnel as plain totals. They are NOT steps of the core loop (a visitor can skip them), so
 * they stay out of `FUNNEL`: they live in the `AnalyticsEvent` union only. Props never carry an email or any personal data.
 */
export const COUNTED_EVENTS = ["ready_email_left", "access_requested", "checkout_started"] as const;

const base = { variant: z.string().max(32).optional(), platform: z.enum(["web", "ios", "android"]) };

export const AnalyticsEvent = z.discriminatedUnion("name", [
  z.object({ name: z.literal("landing_view"), props: z.object({ ...base, heroLine: z.string().max(80) }) }),
  z.object({ name: z.literal("drop_started"), props: z.object({ ...base, bytes: z.number().nonnegative(), source: z.enum(["drop", "picker", "camera", "drive", "sample"]) }) }),
  z.object({ name: z.literal("upload_done"), props: z.object({ ...base, ms: z.number().nonnegative() }) }),
  z.object({ name: z.literal("first_preview"), props: z.object({ ...base, msSinceDrop: z.number().nonnegative() }) }),
  z.object({ name: z.literal("edit_interaction"), props: z.object({ ...base, kind: z.string().max(40) }) }),
  z.object({ name: z.literal("export_clicked"), props: z.object({ ...base, aspect: z.string() }) }),
  z.object({ name: z.literal("signup_prompted"), props: z.object(base) }),
  z.object({ name: z.literal("signup_done"), props: z.object(base) }),
  z.object({ name: z.literal("paywall_shown"), props: z.object({ ...base, reason: z.string().max(40) }) }),
  z.object({ name: z.literal("export_done"), props: z.object({ ...base, durationMs: z.number().nonnegative(), watermark: z.boolean() }) }),
  z.object({ name: z.literal("share"), props: z.object({ ...base, target: z.string().max(40) }) }),
  z.object({ name: z.literal("version_picked"), props: z.object({ ...base, version: z.enum(["clean", "punchy", "genre"]), kind: z.string().max(16).optional() }) }),
  z.object({ name: z.literal("ready_email_left"), props: z.object(base) }),
  z.object({ name: z.literal("access_requested"), props: z.object(base) }),
  z.object({ name: z.literal("checkout_started"), props: z.object({ ...base, plan: z.string().max(40).optional() }) }),
  // defined but emitted nowhere (kept so stored events and old clients still parse); the worker round trip is not tracked
  z.object({ name: z.literal("job_roundtrip"), props: z.object({ ...base, type: z.string(), ms: z.number().nonnegative() }) }),
]);
export type AnalyticsEvent = z.infer<typeof AnalyticsEvent>;
export type EventName = AnalyticsEvent["name"];

export interface AnalyticsSink {
  track(e: AnalyticsEvent): void | Promise<void>;
}

/** Fan out to several sinks; a failing sink never breaks the app. */
export function multiSink(...sinks: AnalyticsSink[]): AnalyticsSink {
  return {
    async track(e) {
      const parsed = AnalyticsEvent.parse(e);
      await Promise.allSettled(sinks.map((s) => s.track(parsed)));
    },
  };
}
