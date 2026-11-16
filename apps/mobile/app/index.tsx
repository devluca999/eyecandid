import { useState } from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useQuery } from "convex/react";
import * as ImagePicker from "expo-image-picker";
import { api } from "@convex/_generated/api";
import { type as T } from "@eyelore/ui/tokens";
import { useAnonId } from "@/lib/anon";
import { probeVideo } from "@/lib/media";
import { useStartProject } from "@/lib/start";
import { useTheme } from "@/lib/theme";
import { Mark, Pill, StatusDot, tap, warn } from "@/lib/ui";

const STAGE: Record<string, string> = { empty: "empty", uploading: "uploading", transcribing: "listening", cutting: "trimming", reframing: "framing", ready: "ready", failed: "needs attention" };

/** Home: record with a script or bring a clip. No signup. Recent edits below, footage first. */
export default function Home() {
  const { c } = useTheme();
  const router = useRouter();
  const anonId = useAnonId();
  const start = useStartProject();
  const mine = useQuery(api.projects.mine, anonId ? { anonId } : "skip");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const importClip = async () => {
    setError(null);
    const picked = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["videos"],
      allowsEditing: false,
      quality: 1,
      // hand over the original file: no re-encode before upload
      preferredAssetRepresentationMode: ImagePicker.UIImagePickerPreferredAssetRepresentationMode.Current,
    });
    const asset = picked.canceled ? null : picked.assets[0];
    if (!asset) return;
    setBusy(true);
    try {
      // the picker's numbers when it has them; otherwise read the file itself
      const meta = asset.width && asset.height && asset.duration ? { w: asset.width, h: asset.height, durationMs: Math.round(asset.duration) } : await probeVideo(asset.uri);
      await start({ uri: asset.uri, source: "upload", title: asset.fileName?.replace(/\.[^.]+$/, ""), contentType: asset.mimeType ?? undefined, ...meta });
    } catch (e) {
      warn();
      setError(e instanceof Error ? e.message : "couldn't open that clip");
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <FlatList
        data={mine ?? []}
        keyExtractor={(p) => p._id}
        contentContainerStyle={{ padding: 24, gap: 8, flexGrow: 1 }}
        ListHeaderComponent={
          <View style={{ gap: 24, paddingTop: 32, paddingBottom: 24 }}>
            <Mark width={56} />
            <Text accessibilityRole="header" style={[T.title, { color: c.ink }]}>
              Making real people look great.
            </Text>
            <Text style={[T.body, { color: c["ink-secondary"] }]}>Record with a script or bring a raw clip. You get back a clean, captioned cut in about a minute. No signup.</Text>
            <View style={{ flexDirection: "row", gap: 12, flexWrap: "wrap" }}>
              <Pill testID="record" label="record" hint="opens the camera with a teleprompter" disabled={!anonId || busy} onPress={() => router.push("/capture")} />
              <Pill testID="import" kind="secondary" label="import a clip" hint="choose a video from your camera roll" disabled={!anonId || busy} onPress={() => void importClip()} />
            </View>
            {error && <StatusDot status="attention" label={error} />}
            {!!mine?.length && <Text style={[T.meta, { color: c["ink-tertiary"], marginTop: 16 }]}>recent</Text>}
          </View>
        }
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.title}, ${STAGE[item.stage] ?? item.stage}`}
            accessibilityHint="opens this edit"
            onPress={() => {
              tap();
              router.push({ pathname: "/edit/[id]", params: { id: item._id } });
            }}
            style={{ minHeight: 44, flexDirection: "row", alignItems: "center", justifyContent: "space-between", borderBottomWidth: 1, borderBottomColor: c.hairline, paddingVertical: 12 }}
          >
            <Text numberOfLines={1} style={[T.ui, { color: c.ink, flexShrink: 1 }]}>
              {item.title}
            </Text>
            <Text style={[T.meta, { color: c["ink-tertiary"] }]}>{STAGE[item.stage] ?? item.stage}</Text>
          </Pressable>
        )}
      />
    </SafeAreaView>
  );
}
