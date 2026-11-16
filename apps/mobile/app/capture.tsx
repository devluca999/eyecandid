import { useEffect, useRef, useState } from "react";
import { KeyboardAvoidingView, Linking, Platform, Pressable, Text, TextInput, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { CameraView, useCameraPermissions, useMicrophonePermissions } from "expo-camera";
import { useKeepAwake } from "expo-keep-awake";
import { type as T } from "@eyelore/ui/tokens";
import { probeVideo } from "@/lib/media";
import { useStartProject } from "@/lib/start";
import { useTheme } from "@/lib/theme";
import { Pill, StatusDot, success, tap, thud, warn } from "@/lib/ui";

/**
 * Capture with a teleprompter. One continuous recording, one line on screen at a time, right under the lens so your
 * eyes stay up. Fluffed a line? Say it again: the edit keeps your last take of each line (and you can restore any).
 */
export default function Capture() {
  const [lines, setLines] = useState<string[] | null>(null);
  return lines === null ? <Script onStart={setLines} /> : <Shoot lines={lines} onBack={() => setLines(null)} />;
}

function Script({ onStart }: { onStart: (lines: string[]) => void }) {
  const { c } = useTheme();
  const router = useRouter();
  const [text, setText] = useState("");
  const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, padding: 24, gap: 16 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginHorizontal: -12 }}>
          <Pill kind="quiet" label="back" onPress={() => router.back()} />
          <Pill kind="quiet" testID="no-script" label="no script" hint="records without a teleprompter" onPress={() => onStart([])} />
        </View>
        <Text accessibilityRole="header" style={[T.title, { color: c.ink }]}>
          What are you going to say?
        </Text>
        <Text style={[T.body, { color: c["ink-secondary"] }]}>One line per row. You&apos;ll see them one at a time while you record.</Text>
        <TextInput
          testID="script-input"
          accessibilityLabel="your script, one line per row"
          multiline
          autoFocus
          value={text}
          onChangeText={setText}
          placeholder={"I used to hate filming myself.\nThen I found a trick.\nHere's how it works."}
          placeholderTextColor={c["ink-tertiary"]}
          textAlignVertical="top"
          style={[T.heading, { flex: 1, color: c.ink, fontWeight: "400" }]}
        />
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
          <Text style={[T.meta, { color: c["ink-tertiary"] }]}>{lines.length ? `${lines.length} line${lines.length === 1 ? "" : "s"}` : ""}</Text>
          <Pill testID="script-done" label="open the camera" disabled={!lines.length} onPress={() => onStart(lines.slice(0, 60))} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Shoot({ lines, onBack }: { lines: string[]; onBack: () => void }) {
  useKeepAwake();
  const { c } = useTheme("night");
  const start = useStartProject();
  const camera = useRef<CameraView>(null);
  const [cam, askCam] = useCameraPermissions();
  const [mic, askMic] = useMicrophonePermissions();
  const [ready, setReady] = useState(false);
  const [recording, setRecording] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [line, setLine] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (cam && !cam.granted && cam.canAskAgain) void askCam();
  }, [cam, askCam]);
  useEffect(() => {
    if (cam?.granted && mic && !mic.granted && mic.canAskAgain) void askMic();
  }, [cam?.granted, mic, askMic]);
  useEffect(() => {
    if (!recording) return;
    const t = setInterval(() => setSeconds((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [recording]);

  const granted = !!cam?.granted && !!mic?.granted;
  const blocked = (cam && !cam.granted && !cam.canAskAgain) || (mic && !mic.granted && !mic.canAskAgain);

  const record = async () => {
    if (!camera.current || recording) return;
    setError(null);
    setSeconds(0);
    setLine(0);
    setRecording(true);
    thud();
    try {
      const clip = await camera.current.recordAsync();
      setRecording(false);
      if (!clip?.uri) throw new Error("the camera didn't return a clip");
      setBusy(true);
      const meta = await probeVideo(clip.uri);
      success();
      await start({ uri: clip.uri, source: "camera", title: lines[0]?.slice(0, 60) ?? "recording", script: lines, ...meta });
    } catch (e) {
      warn();
      setRecording(false);
      setError(e instanceof Error ? e.message : "recording failed");
    } finally {
      setBusy(false);
    }
  };
  const stop = () => {
    thud();
    camera.current?.stopRecording();
  };
  const next = () => {
    if (line < lines.length - 1) {
      tap();
      setLine((l) => l + 1);
    } else if (recording) stop();
  };

  return (
    <View style={{ flex: 1, backgroundColor: "#000000" }}>
      <StatusBar style="light" />
      {granted && <CameraView ref={camera} style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} mode="video" facing="front" onCameraReady={() => setReady(true)} onMountError={(e) => setError(e.message)} />}
      <SafeAreaView style={{ flex: 1, justifyContent: "space-between" }}>
        <View>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 8 }}>
            <Pill theme="night" kind="quiet" label={lines.length ? "script" : "back"} disabled={recording || busy} onPress={onBack} />
            {recording && <StatusDot theme="night" status="attention" label={`recording · ${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`} />}
            <View style={{ width: 64 }} />
          </View>
          {lines.length > 0 && granted && (
            <Pressable
              testID="teleprompter"
              accessibilityRole="button"
              accessibilityLabel={`line ${line + 1} of ${lines.length}: ${lines[line]}`}
              accessibilityHint={line < lines.length - 1 ? "double tap for the next line. say a line again to retake it" : "last line. double tap to finish"}
              onPress={next}
              style={{ marginHorizontal: 16, marginTop: 8, padding: 16, borderRadius: 16, backgroundColor: "rgba(15,15,16,0.55)", borderWidth: 1, borderColor: c["glass-edge"], gap: 8 }}
            >
              <Text style={[T.meta, { color: c["ink-secondary"] }]}>
                line {line + 1} of {lines.length} · tap for the next · say it again to retake
              </Text>
              <Text style={[T.title, { color: c.ink }]}>{lines[line]}</Text>
              {lines[line + 1] && (
                <Text numberOfLines={1} style={[T.body, { color: c["ink-tertiary"] }]}>
                  {lines[line + 1]}
                </Text>
              )}
            </Pressable>
          )}
        </View>

        <View style={{ alignItems: "center", gap: 16, padding: 24 }}>
          {!granted && (
            <View style={{ alignItems: "center", gap: 12 }}>
              <Text style={[T.body, { color: c["ink-secondary"], textAlign: "center" }]}>Eyelore needs the camera and microphone to record you. Nothing leaves the phone until you stop recording.</Text>
              {blocked ? <Pill theme="night" label="open settings" onPress={() => void Linking.openSettings()} /> : <Pill theme="night" label="allow camera and microphone" onPress={() => void askCam().then(() => askMic())} />}
            </View>
          )}
          {error && <StatusDot theme="night" status="attention" label={error} />}
          {busy && <StatusDot theme="night" status="working" label="opening your take" />}
          {granted && !busy && (
            <Pressable
              testID="record-toggle"
              accessibilityRole="button"
              accessibilityLabel={recording ? "stop recording" : "start recording"}
              accessibilityState={{ disabled: !ready }}
              disabled={!ready}
              onPress={() => (recording ? stop() : void record())}
              style={({ pressed }) => ({ width: 76, height: 76, borderRadius: 38, borderWidth: 2, borderColor: c["chrome-mid"], alignItems: "center", justifyContent: "center", opacity: ready ? 1 : 0.4, transform: [{ scale: pressed ? 0.92 : 1 }] })}
            >
              <View style={{ width: recording ? 28 : 60, height: recording ? 28 : 60, borderRadius: recording ? 6 : 30, backgroundColor: c["status-attention"] }} />
            </Pressable>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
}
