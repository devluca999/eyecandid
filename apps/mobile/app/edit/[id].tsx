import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Alert, Animated, Modal, Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useMutation, useQuery } from "convex/react";
import { VideoView } from "expo-video";
import * as MediaLibrary from "expo-media-library/legacy";
import * as Sharing from "expo-sharing";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { coverBox, faceAt, outputAt, toTimeline, type Aspect, type Bead, type EditOp } from "@eyelore/core";
import { motion, radius, type as T } from "@eyelore/ui/tokens";
import { useAnonId } from "@/lib/anon";
import { downloadExport } from "@/lib/media";
import { usePending } from "@/lib/pending";
import { useTheme, type Palette } from "@/lib/theme";
import { useTrack } from "@/lib/track";
import { Choice, Pill, StatusDot, success, tap, thud, warn } from "@/lib/ui";
import { useEditPlayer } from "@/lib/usePlayer";

const STAGE_WORD: Record<string, string> = {
  empty: "waiting for your clip",
  uploading: "uploading",
  transcribing: "listening",
  cutting: "trimming fillers and pauses",
  reframing: "finding your face",
  ready: "ready",
};

/** No worker is polling. Say what is actually happening: asked one to start, nothing to ask, or asking isn't working. */
function coldLine(wake: "asked" | "none" | "failing" | null | undefined) {
  if (wake === "failing") return "the engine isn't answering · we keep trying, your clip is safe";
  if (wake === "none") return "no engine is running right now · your clip starts when one comes online";
  return "the engine is waking up · usually under a minute";
}
const ASPECTS: Aspect[] = ["9:16", "4:5", "1:1", "16:9"];
const ASPECT_RATIO: Record<Aspect, number> = { "9:16": 9 / 16, "4:5": 4 / 5, "1:1": 1, "16:9": 16 / 9 };
const MOMENT_LABEL = { hook: "hook", best: "best line", cta: "call to action" } as const;
const CENTRE = { cx: 0.5, cy: 0.5, scale: 1 };

type Saved = { exportId: string; state: "saving" | "saved" | "denied" | "error"; uri?: string };

/**
 * Review, in the theater: Night, the circle Lens, and the edit playing exactly as it will render. Tap the Lens to
 * play or pause; choose a ratio to see the frame. Below it, the light edits: restore or cut words, pauses and
 * lines, fix a caption's spelling, then export to the camera roll.
 */
export default function Edit() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const projectId = id as Id<"projects">;
  const router = useRouter();
  const { c } = useTheme("night");
  const win = useWindowDimensions();
  const anonId = useAnonId();
  const track = useTrack();
  const pending = usePending(projectId);
  const data = useQuery(api.projects.get, anonId ? { projectId, anonId } : "skip");
  const presence = useQuery(api.jobs.workerPresence, {});
  const apply = useMutation(api.edits.apply);
  const undo = useMutation(api.edits.undo);
  const startExport = useMutation(api.pipeline.startExport);
  const remove = useMutation(api.projects.remove);

  const doc = data?.doc ?? null;
  const clip = doc?.clips[0] ?? null;
  const tl = useMemo(() => (doc && doc.beads.length ? toTimeline(doc) : null), [doc]);
  const sourceMedia = data?.media.find((m) => m.kind === "source");
  const uri = pending?.uri ?? sourceMedia?.url ?? null;
  const player = useEditPlayer(uri, tl?.segments ?? null, clip?.id ?? null);

  const [frame, setFrame] = useState(false); // false = theater circle, true = the output frame
  const [notice, setNotice] = useState<string | null>(null);
  const [fixing, setFixing] = useState<{ wordId: string; from: string; text: string } | null>(null);
  const [saved, setSaved] = useState<Saved | null>(null);
  const requested = useRef(false);
  const exportSeq = useRef(0);

  // where we are, honestly
  const stage = data?.project.stage ?? "empty";
  const ready = stage === "ready";
  const uploading = !!pending && pending.uploadProgress < 1 && !pending.error;
  const cold = !!presence && presence.live === 0 && !ready && stage !== "failed" && !uploading;
  const activeJob = data?.jobs.find((j) => j.status === "running" || j.status === "leased" || j.status === "queued");
  const stageLine = pending?.error
    ? pending.error
    : uploading
      ? `uploading · ${Math.round((pending?.uploadProgress ?? 0) * 100)}%`
      : stage === "failed"
        ? (data?.project.stageDetail ?? "something went wrong")
        : cold
          ? coldLine(presence?.wake)
          : ready
            ? null
            : `${STAGE_WORD[stage] ?? stage}${activeJob?.status === "running" ? ` · ${Math.round(activeJob.progress * 100)}%` : ""}`;
  const failed = stage === "failed" || !!pending?.error;

  const wasReady = useRef(false);
  useEffect(() => {
    if (ready && !wasReady.current) {
      wasReady.current = true;
      if (pending) {
        success();
        track("first_preview", { msSinceDrop: Date.now() - pending.startedAt });
      }
    }
    if (failed) warn();
  }, [ready, failed, pending, track]);

  const commit = useCallback(
    async (ops: EditOp[], reason: string, kind: string) => {
      if (!doc || !anonId) return;
      setNotice(null);
      try {
        const r = await apply({ anonId, projectId, baseVersion: doc.version, ops, reason });
        if (!r.ok) setNotice("that edit crossed with another · try again");
        else track("edit_interaction", { kind });
      } catch (e) {
        warn();
        setNotice(e instanceof Error ? e.message.replace(/^.*Uncaught Error: /s, "").split("\n")[0]! : "couldn't save that");
      }
    },
    [anonId, apply, doc, projectId, track],
  );
  const toggleWord = (b: Bead, wordId: string) => {
    const w = b.words.find((x) => x.id === wordId)!;
    void commit([{ op: "set", path: `/beads/@${b.id}/words/@${w.id}/struck`, value: !w.struck }], `${w.struck ? "restored" : "cut"} · '${w.text}'`, "word");
  };
  const toggleCut = (b: Bead, cutId: string) => {
    const x = b.cuts.find((k) => k.id === cutId)!;
    const s = ((x.endMs - x.startMs) / 1000).toFixed(1);
    void commit([{ op: "set", path: `/beads/@${b.id}/cuts/@${x.id}/struck`, value: !x.struck }], `${x.struck ? "kept pause" : "cut pause"} · ${s}s`, "pause");
  };
  const toggleBead = (b: Bead) =>
    void commit([{ op: "set", path: `/beads/@${b.id}/struck`, value: !b.struck }], `${b.struck ? "kept" : "cut"} bead · '${b.words.slice(0, 3).map((w) => w.text).join(" ")}…'`, "bead");
  const setAspect = (a: Aspect) => {
    setFrame(true);
    if (doc && doc.aspect !== a) void commit([{ op: "set", path: "/aspect", value: a }], `aspect · ${a}`, "aspect");
  };
  const saveFix = () => {
    if (!fixing) return;
    const to = fixing.text.trim();
    if (to && to !== fixing.from) void commit([{ op: "insert", path: "/captions/overrides/-", value: { wordId: fixing.wordId, text: to } }], `caption · '${fixing.from}' → '${to}'`, "caption");
    setFixing(null);
  };

  // export → camera roll
  const latest = data?.exports[0];
  const exporting = !!latest && (latest.status === "queued" || latest.status === "leased" || latest.status === "running");
  const doExport = async () => {
    if (!doc || !anonId || !ready) return;
    requested.current = true;
    setSaved(null);
    track("export_clicked", { aspect: doc.aspect });
    // signup and the paywall at export arrive with keys (PLAN: Needs keys); until then exports are anonymous and watermarked
    await startExport({ anonId, projectId, aspect: doc.aspect, requestId: `${Date.now()}-${exportSeq.current++}` });
  };
  useEffect(() => {
    if (!requested.current || !latest || latest.status !== "succeeded" || !latest.url || saved?.exportId === latest._id) return;
    const exportId = latest._id;
    setSaved({ exportId, state: "saving" });
    void (async () => {
      try {
        const file = await downloadExport(latest.url!, `eyelore-${exportId}`);
        const perm = await MediaLibrary.requestPermissionsAsync(true);
        if (!perm.granted) return setSaved({ exportId, state: "denied", uri: file });
        await MediaLibrary.saveToLibraryAsync(file);
        success();
        setSaved({ exportId, state: "saved", uri: file });
        track("export_done", { durationMs: latest.durationMs ?? 0, watermark: latest.watermark });
      } catch {
        warn();
        setSaved({ exportId, state: "error" });
      }
    })();
  }, [latest, saved, track]);
  // delete for good: the clip, the edit and its exports. Asked once, natively; never while the upload is in flight
  const confirmDelete = () =>
    Alert.alert("Delete this edit?", "Its clip and exports are removed for good. This can't be undone.", [
      { text: "Keep", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: () => {
          if (!anonId) return;
          player.player.pause();
          remove({ projectId, anonId })
            .then(() => {
              success();
              router.replace("/");
            })
            .catch(() => {
              warn();
              setNotice("couldn't delete that · try again");
            });
        },
      },
    ]);
  const share = async () => {
    if (!saved?.uri) return;
    track("share", { target: "share_sheet" });
    await Sharing.shareAsync(saved.uri, { mimeType: "video/mp4", UTI: "public.mpeg-4", dialogTitle: "share your edit" });
  };

  // Lens geometry: the theater circle, or the output frame at the chosen ratio. One window, two shapes.
  const availW = win.width - 32;
  const availH = Math.round(win.height * 0.46);
  const circle = Math.min(availW, availH);
  const ratio = ASPECT_RATIO[doc?.aspect ?? "9:16"];
  const frameH = Math.min(availH, availW / ratio);
  const frameW = frameH * ratio;
  const morph = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    Animated.spring(morph, { toValue: frame ? 1 : 0, ...motion.springMorph, useNativeDriver: false }).start();
  }, [frame, morph]);
  const face = clip ? faceAt(doc?.reframe[clip.id], player.srcMs) : CENTRE;
  const srcW = clip?.w ?? sourceMedia?.w ?? 9;
  const srcH = clip?.h ?? sourceMedia?.h ?? 16;
  const boxA = coverBox(srcW, srcH, circle, circle, face);
  const boxB = coverBox(srcW, srcH, frameW, frameH, face);
  const pct = (a: number, b: number) => morph.interpolate({ inputRange: [0, 1], outputRange: [`${a * 100}%`, `${b * 100}%`] });
  const lens = {
    width: morph.interpolate({ inputRange: [0, 1], outputRange: [circle, frameW] }),
    height: morph.interpolate({ inputRange: [0, 1], outputRange: [circle, frameH] }),
    borderRadius: morph.interpolate({ inputRange: [0, 1], outputRange: [circle / 2, radius.lens] }),
  };
  const videoBox = {
    left: pct(boxA.left / circle, boxB.left / frameW),
    top: pct(boxA.top / circle, boxB.top / frameH),
    width: pct(boxA.width / circle, boxB.width / frameW),
    height: pct(boxA.height / circle, boxB.height / frameH),
  };

  // a soft breathing edge while the engine works: never a bare spinner
  const pulse = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (ready || failed) return pulse.setValue(0);
    const loop = Animated.loop(Animated.sequence([Animated.timing(pulse, { toValue: 1, duration: motion.shimmerMs / 2, useNativeDriver: false }), Animated.timing(pulse, { toValue: 0, duration: motion.shimmerMs / 2, useNativeDriver: false })]));
    loop.start();
    return () => loop.stop();
  }, [ready, failed, pulse]);

  const outMs = tl && clip ? outputAt(tl.segments, clip.id, player.srcMs) : null;
  // paused before the first kept word (e.g. on a struck "um"): show the first caption, not nothing
  const chunk = outMs != null ? tl?.captions.find((k) => outMs >= k.startMs && outMs < k.endMs) : !player.playing ? tl?.captions[0] : undefined;
  const playheadBead = doc?.beads.find((b) => player.srcMs >= b.inMs && player.srcMs < b.outMs)?.id ?? null;

  const summary = useMemo(() => {
    if (!doc || !doc.beads.length) return null;
    const words = doc.beads.flatMap((b) => b.words);
    const fillers = words.filter((w) => w.struck && w.strikeKind === "filler").length;
    const pauses = doc.beads.flatMap((b) => b.cuts).filter((k) => k.struck).length;
    const retakes = doc.beads.filter((b) => b.struck).length;
    const parts = [fillers && `${fillers} filler${fillers === 1 ? "" : "s"} trimmed`, pauses && `${pauses} pause${pauses === 1 ? "" : "s"} cut`, retakes && `${retakes} line${retakes === 1 ? "" : "s"} cut`].filter(Boolean);
    return parts.length ? parts.join(" · ") : "nothing needed trimming";
  }, [doc]);

  if (data === null) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas, alignItems: "center", justifyContent: "center", gap: 16, padding: 24 }}>
        <StatusBar style="light" />
        <Text style={[T.body, { color: c["ink-secondary"], textAlign: "center" }]}>This edit isn&apos;t on this phone, or it doesn&apos;t exist.</Text>
        <Pill theme="night" label="start an edit" onPress={() => router.replace("/")} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: c.canvas }}>
      <StatusBar style="light" />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 8 }}>
        <Pill theme="night" kind="quiet" label="back" hint="returns to your edits" onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))} />
        <Text numberOfLines={1} style={[T.meta, { color: c["ink-tertiary"], flexShrink: 1 }]}>
          {data?.project.title ?? ""}
        </Text>
        <View style={{ flexDirection: "row" }}>
          {data && !uploading && <Pill theme="night" kind="quiet" testID="delete" label="delete" hint="deletes this edit, its clip and its exports for good" onPress={confirmDelete} />}
          <Pill theme="night" kind="quiet" testID="lens-mode" label={frame ? "theater" : "frame"} hint={frame ? "shows the circle Lens" : "shows the frame at your chosen ratio"} onPress={() => setFrame((f) => !f)} />
        </View>
      </View>

      <View style={{ height: availH + 8, alignItems: "center", justifyContent: "center" }}>
        <Animated.View style={[{ overflow: "hidden", backgroundColor: c["surface-sunken"], borderWidth: 1, borderColor: pulse.interpolate({ inputRange: [0, 1], outputRange: [c.hairline, c["chrome-mid"]] }) }, lens]}>
          <Pressable
            testID="lens"
            accessibilityRole="button"
            accessibilityLabel={ready ? (player.playing ? "pause your edit" : "play your edit") : "your clip"}
            accessibilityHint={ready ? "plays the cut exactly as it will export" : (stageLine ?? undefined)}
            disabled={!uri}
            onPress={() => {
              thud();
              player.toggle();
            }}
            style={{ flex: 1 }}
          >
            {uri && (
              <Animated.View style={[{ position: "absolute" }, videoBox]} pointerEvents="none">
                <VideoView player={player.player} style={{ flex: 1 }} contentFit="fill" nativeControls={false} allowsPictureInPicture={false} />
              </Animated.View>
            )}
            {!ready && <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(8,8,10,0.45)" }} />}
          </Pressable>
          {ready && chunk && doc?.captions.enabled && (
            <View pointerEvents="none" style={{ position: "absolute", left: "10%", right: "10%", bottom: frame ? "12%" : "18%", alignItems: "center" }}>
              <Text testID="caption" style={[T.caption, { color: "#FFFFFF", textAlign: "center", textShadowColor: "rgba(0,0,0,0.75)", textShadowRadius: 6, textShadowOffset: { width: 0, height: 1 } }]}>{chunk.text}</Text>
            </View>
          )}
        </Animated.View>
      </View>

      <View style={{ minHeight: 28, alignItems: "center", justifyContent: "center", paddingHorizontal: 24 }}>
        {stageLine ? (
          <StatusDot theme="night" testID="stage" status={failed ? "attention" : "working"} label={stageLine} />
        ) : summary ? (
          <StatusDot theme="night" testID="ready" status="ready" label={summary} />
        ) : null}
        {notice && <Text accessibilityLiveRegion="polite" style={[T.meta, { color: c["status-attention"], marginTop: 4 }]}>{notice}</Text>}
      </View>

      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 12, gap: 4 }}>
        {doc?.beads.map((b, i) => (
          <BeadRow
            key={b.id}
            c={c}
            bead={b}
            index={i}
            overrides={doc.captions.overrides}
            atPlayhead={playheadBead === b.id}
            onSeek={() => player.seekSrc(b.inMs)}
            onToggleWord={(wid) => toggleWord(b, wid)}
            onToggleCut={(cid) => toggleCut(b, cid)}
            onToggleBead={() => toggleBead(b)}
            onFix={(wordId, from) => setFixing({ wordId, from, text: from })}
          />
        ))}
        {ready && (
          <Text style={[T.meta, { color: c["ink-tertiary"], paddingTop: 8 }]}>tap a word to cut or restore it · hold a word to fix its spelling</Text>
        )}
      </ScrollView>

      {ready && doc && (
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 8, gap: 12, borderTopWidth: 1, borderTopColor: c.hairline }}>
          <View accessibilityRole="radiogroup" accessibilityLabel="aspect ratio" style={{ flexDirection: "row", gap: 8, justifyContent: "center" }}>
            {ASPECTS.map((a) => (
              <Choice key={a} theme="night" testID={`aspect-${a.replace(":", "x")}`} label={a} selected={doc.aspect === a} hint="re-frames around your face" onPress={() => setAspect(a)} />
            ))}
          </View>
          <View style={{ minHeight: 16, alignItems: "center" }}>
            {exporting ? (
              <StatusDot theme="night" testID="export-progress" status="working" label={`${latest?.stage || "rendering"} · ${Math.round((latest?.progress ?? 0) * 100)}%`} />
            ) : saved?.state === "saving" ? (
              <StatusDot theme="night" status="working" label="saving to your camera roll" />
            ) : saved?.state === "saved" ? (
              <StatusDot theme="night" testID="export-saved" status="ready" label="saved to your camera roll" />
            ) : saved?.state === "denied" ? (
              <StatusDot theme="night" testID="export-denied" status="attention" label="no access to photos · share it instead" />
            ) : saved?.state === "error" || (requested.current && latest?.status === "failed") ? (
              <StatusDot theme="night" status="attention" label={latest?.error ? `export failed · ${latest.error}`.slice(0, 80) : "couldn't save the export · try again"} />
            ) : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Pill theme="night" kind="quiet" testID="undo" label="undo" hint="undoes your last change" onPress={() => anonId && void undo({ anonId, projectId, baseVersion: doc.version })} />
            <View style={{ flex: 1 }} />
            {saved?.uri && !exporting ? <Pill theme="night" kind="secondary" testID="share" label="share" hint="opens the share sheet with your video" onPress={() => void share()} /> : null}
            <Pill theme="night" testID="export" label={`export ${doc.aspect}`} hint="renders the cut and saves it to your camera roll" disabled={exporting || saved?.state === "saving"} onPress={() => void doExport()} />
          </View>
        </View>
      )}

      <Modal visible={!!fixing} transparent animationType="fade" onRequestClose={() => setFixing(null)}>
        <Pressable accessibilityLabel="close" onPress={() => setFixing(null)} style={{ flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "center", padding: 24 }}>
          <Pressable onPress={() => {}} style={{ backgroundColor: c["surface-raised"], borderRadius: radius.glass, borderWidth: 1, borderColor: c["glass-edge"], padding: 16, gap: 12 }}>
            <Text style={[T.meta, { color: c["ink-secondary"] }]}>fix the spelling · your words stay your words</Text>
            <TextInput
              testID="fix-input"
              accessibilityLabel={`caption spelling for ${fixing?.from ?? ""}`}
              autoFocus
              autoCapitalize="none"
              autoCorrect={false}
              value={fixing?.text ?? ""}
              onChangeText={(text) => setFixing((f) => (f ? { ...f, text } : f))}
              onSubmitEditing={saveFix}
              returnKeyType="done"
              style={[T.heading, { color: c.ink, borderBottomWidth: 1, borderBottomColor: c.hairline, paddingVertical: 8 }]}
            />
            <View style={{ flexDirection: "row", justifyContent: "flex-end", gap: 8 }}>
              <Pill theme="night" kind="quiet" label="cancel" onPress={() => setFixing(null)} />
              <Pill theme="night" testID="fix-save" label="save" onPress={saveFix} />
            </View>
          </Pressable>
        </Pressable>
      </Modal>
    </SafeAreaView>
  );
}

function BeadRow({
  c, bead, index, overrides, atPlayhead, onSeek, onToggleWord, onToggleCut, onToggleBead, onFix,
}: {
  c: Palette; bead: Bead; index: number; overrides: { wordId: string; text: string }[]; atPlayhead: boolean;
  onSeek: () => void; onToggleWord: (wordId: string) => void; onToggleCut: (cutId: string) => void; onToggleBead: () => void; onFix: (wordId: string, from: string) => void;
}) {
  const shown = (id: string, text: string) => overrides.findLast((o) => o.wordId === id)?.text ?? text;
  return (
    <View testID={`bead-${index}`} style={{ flexDirection: "row", gap: 8, paddingVertical: 4, opacity: bead.struck ? 0.4 : 1 }}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`line ${index + 1}${bead.moment ? `, ${MOMENT_LABEL[bead.moment]}` : ""}${bead.struck ? ", cut" : ""}`}
        accessibilityHint="jumps to this line"
        onPress={() => {
          tap();
          onSeek();
        }}
        hitSlop={8}
        style={{ width: 28, alignItems: "center", paddingTop: 10 }}
      >
        <View style={{ width: 2, flex: 1, minHeight: 24, borderRadius: 1, backgroundColor: atPlayhead ? c.ink : c.hairline }} />
      </Pressable>
      <View style={{ flex: 1 }}>
        {bead.moment && <Text style={[T.meta, { color: c["ink-tertiary"] }]}>{MOMENT_LABEL[bead.moment]}</Text>}
        <View style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {bead.words.map((w) => (
            <Pressable
              key={w.id}
              testID={w.struck ? "struck-word" : "word"}
              accessibilityRole="button"
              accessibilityLabel={`${shown(w.id, w.text)}, ${w.struck ? "cut" : "kept"}`}
              accessibilityHint={w.struck ? "double tap to restore · hold to fix spelling" : "double tap to cut · hold to fix spelling"}
              onPress={() => {
                tap();
                onToggleWord(w.id);
              }}
              onLongPress={() => {
                thud();
                onFix(w.id, shown(w.id, w.text));
              }}
              style={{ paddingHorizontal: 3, paddingVertical: 9 }}
            >
              <Text style={[T.body, { color: w.struck ? c["ink-tertiary"] : c.ink, textDecorationLine: w.struck ? "line-through" : "none" }]}>{shown(w.id, w.text)}</Text>
            </Pressable>
          ))}
          {bead.cuts.map((k) => {
            const s = ((k.endMs - k.startMs) / 1000).toFixed(1);
            return (
              <Pressable
                key={k.id}
                testID="pause"
                accessibilityRole="button"
                accessibilityLabel={`pause, ${s} seconds, ${k.struck ? "cut" : "kept"}`}
                accessibilityHint={k.struck ? "double tap to keep the pause" : "double tap to cut the pause"}
                onPress={() => {
                  tap();
                  onToggleCut(k.id);
                }}
                style={{ paddingHorizontal: 3, paddingVertical: 9 }}
              >
                <Text style={[T.body, { color: c["ink-tertiary"], textDecorationLine: k.struck ? "line-through" : "none" }]}>· {s}s</Text>
              </Pressable>
            );
          })}
        </View>
      </View>
      <Pill theme="night" kind="quiet" testID={`bead-toggle-${index}`} label={bead.struck ? "keep" : "cut"} hint={bead.struck ? "puts this line back" : "cuts this whole line"} onPress={onToggleBead} />
    </View>
  );
}
