import { useCallback, useEffect, useRef, useState } from "react";
import { useVideoPlayer } from "expo-video";
import { outputAt, type Segment } from "@eyelore/core";

/**
 * Plays the *edit* from the raw source: skips struck words, pauses and beads as it goes, so what you watch is what
 * will render (the same `toTimeline` segments as the web player and the renderer).
 */
export function useEditPlayer(uri: string | null, segments: Segment[] | null, clipId: string | null) {
  const player = useVideoPlayer(uri, (p) => {
    p.timeUpdateEventInterval = 0.05;
    p.seekTolerance = { toleranceBefore: 0, toleranceAfter: 0 };
  });
  const [srcMs, setSrcMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const segs = useRef(segments);
  segs.current = segments;

  const startOf = useCallback(() => (segs.current?.[0]?.fromMs ?? 0) / 1000, []);

  useEffect(() => {
    const onTime = player.addListener("timeUpdate", ({ currentTime }) => {
      const ms = currentTime * 1000;
      const list = segs.current;
      if (list?.length && clipId && player.playing && outputAt(list, clipId, ms) === null) {
        const next = list.find((s) => s.clipId === clipId && s.fromMs > ms);
        if (next) player.currentTime = next.fromMs / 1000;
        else {
          player.pause();
          player.currentTime = startOf();
        }
      }
      setSrcMs(ms);
    });
    const onPlaying = player.addListener("playingChange", ({ isPlaying }) => setPlaying(isPlaying));
    const onEnd = player.addListener("playToEnd", () => {
      player.pause();
      player.currentTime = startOf();
    });
    return () => {
      onTime.remove();
      onPlaying.remove();
      onEnd.remove();
    };
  }, [player, clipId, startOf]);

  const toggle = useCallback(() => {
    if (player.playing) return player.pause();
    const list = segs.current;
    const ms = player.currentTime * 1000;
    if (list?.length && clipId && outputAt(list, clipId, ms) === null) {
      player.currentTime = (list.find((s) => s.fromMs > ms) ?? list[0]!).fromMs / 1000;
    }
    player.play();
  }, [player, clipId]);

  const seekSrc = useCallback(
    (ms: number) => {
      player.currentTime = ms / 1000;
      setSrcMs(ms);
    },
    [player],
  );

  return { player, playing, srcMs, toggle, seekSrc };
}
