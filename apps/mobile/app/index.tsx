import { useEffect, useState } from "react";
import { SafeAreaView, Text, View } from "react-native";
import { useMutation, useQuery } from "convex/react";
import * as Haptics from "expo-haptics";
import * as Crypto from "expo-crypto";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { type as T } from "@eyelore/ui/tokens";
import { getAnonId } from "@/lib/anon";
import { useTheme } from "@/lib/theme";
import { LensCircle, Pill, StatusDot } from "@/lib/ui";

/** Phase 1: the same hello round-trip as the web, natively. Phase 2 replaces this with capture + review. */
export default function Home() {
  const { c } = useTheme();
  const [anonId, setAnonId] = useState<string | null>(null);
  const [jobId, setJobId] = useState<Id<"jobs"> | null>(null);
  useEffect(() => void getAnonId().then(setAnonId), []);
  const enqueue = useMutation(api.jobs.enqueueHello);
  const presence = useQuery(api.jobs.workerPresence, {});
  const job = useQuery(api.jobs.get, jobId && anonId ? { jobId, anonId } : "skip");

  useEffect(() => {
    if (job?.status === "succeeded") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    if (job?.status === "failed") void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, [job?.status]);

  const working = job && job.status !== "succeeded" && job.status !== "failed";
  const stage = job ? job.stage : presence?.live ? `${presence.live} worker online` : "no worker online · the engine is cold";

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", gap: 24, padding: 24 }}>
        <Text accessibilityRole="header" style={[T.heading, { color: c.ink }]}>Making real people look great.</Text>
        <LensCircle progress={job ? job.progress : null} />
        <View style={{ alignItems: "center", gap: 8 }} accessibilityLiveRegion="polite">
          <StatusDot status={!job || job.status === "succeeded" ? "ready" : job.status === "failed" ? "attention" : "working"} label={!job ? "ready" : job.status === "succeeded" ? "done" : working ? "working" : job.status} />
          <Text testID="stage" style={[T.meta, { color: c["ink-secondary"], fontWeight: "400" }]}>{stage}</Text>
          {job?.status === "succeeded" && (
            <Text testID="result" style={[T.body, { color: c.ink, fontWeight: "400" }]}>
              {(job.output as { echo?: string } | undefined)?.echo}
            </Text>
          )}
        </View>
        <Pill
          testID="run-hello"
          label="run"
          disabled={!anonId}
          onPress={async () => anonId && setJobId(await enqueue({ anonId, message: "hello from the phone", requestId: Crypto.randomUUID() }))}
        />
      </View>
    </SafeAreaView>
  );
}
