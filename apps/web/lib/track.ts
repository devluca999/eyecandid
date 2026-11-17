"use client";
import { useCallback } from "react";
import { useMutation } from "convex/react";
import { track as vercelTrack } from "@vercel/analytics";
import { api } from "@convex/_generated/api";
import { heroVariant } from "@eyelore/core/flags";
import type { AnalyticsEvent } from "@eyelore/core";
import { getAnonId } from "./anon";

type Props<N extends AnalyticsEvent["name"]> = Omit<Extract<AnalyticsEvent, { name: N }>["props"], "platform" | "variant">;

/** Typed funnel events → Convex events + Vercel Web Analytics. Never throws into the UI. */
export function useTrack() {
  const convexTrack = useMutation(api.events.track);
  return useCallback(
    <N extends AnalyticsEvent["name"]>(name: N, props: Props<N>) => {
      const anonId = getAnonId();
      const event = { name, props: { platform: "web", variant: heroVariant(anonId), ...props } } as AnalyticsEvent;
      convexTrack({ anonId, event }).catch(() => {});
      try {
        vercelTrack(name, Object.fromEntries(Object.entries(event.props).filter(([, v]) => ["string", "number", "boolean"].includes(typeof v))) as Record<string, string | number | boolean>);
      } catch {
        // analytics must never break the editor
      }
    },
    [convexTrack],
  );
}
