"use client";
import { track as vercelTrack } from "@vercel/analytics";
import type { AnalyticsEvent, AnalyticsSink } from "@eyelore/core";
import { multiSink } from "@eyelore/core";

/** Typed funnel events → Convex `events` + Vercel Web Analytics (provider-agnostic, ADR in PLAN.md §5). */
export function makeAnalytics(convexTrack: (e: AnalyticsEvent) => Promise<unknown>): AnalyticsSink {
  return multiSink(
    { track: (e) => void convexTrack(e) },
    { track: (e) => vercelTrack(e.name, Object.fromEntries(Object.entries(e.props).filter(([, v]) => ["string", "number", "boolean"].includes(typeof v))) as Record<string, string | number | boolean>) },
  );
}
