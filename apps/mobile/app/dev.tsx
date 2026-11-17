import { useEffect, useState } from "react";
import { Text, View } from "react-native";
import { Redirect, useLocalSearchParams } from "expo-router";
import * as FileSystem from "expo-file-system/legacy";
import { probeVideo } from "@/lib/media";
import { useStartProject } from "@/lib/start";

/**
 * Development builds only (`__DEV__`): start an edit from a clip URL, for simulators, which have no camera and no
 * touch automation here — `xcrun simctl openurl booted "eyelore://dev?clip=http://127.0.0.1:8899/talk.mp4"`.
 * Release builds redirect home, so the Maestro proof can only go through the real picker.
 */
export default function Dev() {
  const { clip, script } = useLocalSearchParams<{ clip?: string; script?: string }>();
  const start = useStartProject();
  const [note, setNote] = useState("fetching the clip");
  useEffect(() => {
    if (!__DEV__ || !clip) return;
    void (async () => {
      try {
        const target = `${FileSystem.cacheDirectory}dev-${Date.now()}.mp4`;
        await FileSystem.downloadAsync(clip, target);
        const meta = await probeVideo(target);
        await start({ uri: target, source: "upload", title: "dev clip", script: script ? script.split("|") : undefined, ...meta });
      } catch (e) {
        setNote(e instanceof Error ? e.message : "failed");
      }
    })();
  }, [clip]);
  if (!__DEV__) return <Redirect href="/" />;
  return (
    <View style={{ flex: 1, alignItems: "center", justifyContent: "center" }}>
      <Text>{note}</Text>
    </View>
  );
}
