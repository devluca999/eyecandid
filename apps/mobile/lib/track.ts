import { useCallback } from "react";
import { Platform } from "react-native";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { heroVariant, type AnalyticsEvent } from "@eyelore/core";
import { getAnonId } from "./anon";

type Props<N extends AnalyticsEvent["name"]> = Omit<Extract<AnalyticsEvent, { name: N }>["props"], "platform" | "variant">;

/** Typed funnel events → Convex events (the same layer as the web). Never throws into the UI. */
export function useTrack() {
  const send = useMutation(api.events.track);
  return useCallback(
    <N extends AnalyticsEvent["name"]>(name: N, props: Props<N>) => {
      void getAnonId()
        .then((anonId) => {
          const platform = Platform.OS === "ios" ? "ios" : "android";
          const event = { name, props: { platform, variant: heroVariant(anonId), ...props } } as AnalyticsEvent;
          return send({ anonId, event });
        })
        .catch(() => {});
    },
    [send],
  );
}
