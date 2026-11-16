"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { outputAt, type Segment } from "@eyelore/core";

/**
 * Plays the *edit* from the raw source: skips struck words, pauses and beads in real time, so what you see
 * is what will render. Single-source clips for now (multi-clip switches media per segment).
 */
export function usePlayer(segments: Segment[] | null, clipId: string | null) {
  const video = useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [srcMs, setSrcMs] = useState(0);
  const segs = useRef(segments);
  segs.current = segments;

  useEffect(() => {
    let raf = 0;
    const tick = () => {
      const v = video.current;
      if (v) {
        const ms = v.currentTime * 1000;
        const list = segs.current;
        if (list && list.length && clipId && !v.paused) {
          if (outputAt(list, clipId, ms) === null) {
            const next = list.find((s) => s.clipId === clipId && s.fromMs > ms);
            if (next) v.currentTime = next.fromMs / 1000;
            else {
              v.pause();
              v.currentTime = list[0]!.fromMs / 1000;
            }
          }
        }
        setSrcMs(v.currentTime * 1000);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [clipId]);

  const toggle = useCallback(() => {
    const v = video.current;
    if (!v) return;
    if (v.paused) {
      const list = segs.current;
      if (list?.length && clipId && outputAt(list, clipId, v.currentTime * 1000) === null) {
        v.currentTime = (list.find((s) => s.fromMs > v.currentTime * 1000) ?? list[0]!).fromMs / 1000;
      }
      void v.play();
    } else v.pause();
  }, [clipId]);

  const seekSrc = useCallback((ms: number) => {
    const v = video.current;
    if (!v) return;
    const max = Number.isFinite(v.duration) ? v.duration * 1000 : ms;
    v.currentTime = Math.max(0, Math.min(max, ms)) / 1000;
    setSrcMs(v.currentTime * 1000);
  }, []);
  const play = useCallback(() => {
    if (video.current?.paused) toggle();
  }, [toggle]);
  const pause = useCallback(() => video.current?.pause(), []);

  return { video, playing, setPlaying, srcMs, toggle, play, pause, seekSrc };
}
