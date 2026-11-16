"use client";
import { useEffect, useState } from "react";

/** Stills for beads, grabbed from the local/streamed source in the browser (no server round-trip). */
export function useThumbs(src: string | undefined, timesMs: number[]) {
  const [thumbs, setThumbs] = useState<Record<number, string>>({});
  const key = timesMs.join(",");
  useEffect(() => {
    if (!src || !timesMs.length) return;
    let cancelled = false;
    const v = document.createElement("video");
    v.muted = true;
    v.crossOrigin = "anonymous";
    v.preload = "auto";
    v.src = src;
    const canvas = document.createElement("canvas");
    const grab = async () => {
      const out: Record<number, string> = {};
      for (const t of timesMs) {
        if (cancelled) return;
        await new Promise<void>((resolve) => {
          v.onseeked = () => resolve();
          v.currentTime = t / 1000 + 0.05;
        });
        const h = 96;
        canvas.height = h;
        canvas.width = Math.round((v.videoWidth / v.videoHeight) * h) || h;
        try {
          canvas.getContext("2d")!.drawImage(v, 0, 0, canvas.width, canvas.height);
          out[t] = canvas.toDataURL("image/jpeg", 0.7);
        } catch {
          return; // cross-origin source without CORS: keep the stand-in
        }
      }
      if (!cancelled) setThumbs(out);
    };
    v.onloadeddata = () => void grab();
    return () => {
      cancelled = true;
      v.removeAttribute("src");
      v.load();
    };
  }, [src, key]);
  return thumbs;
}
