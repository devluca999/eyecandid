"use client";
import { useEffect, useState } from "react";

/** Can this browser hand a video file to the system share sheet (phones, Safari, Chrome on Windows and ChromeOS)? */
export function canShareVideo(nav: Partial<Pick<Navigator, "share" | "canShare">> | undefined = typeof navigator === "undefined" ? undefined : navigator): boolean {
  if (!nav?.share || !nav.canShare) return false;
  try {
    return nav.canShare({ files: [new File([new Uint8Array(1)], "x.mp4", { type: "video/mp4" })] });
  } catch {
    return false;
  }
}

/**
 * The finished export as a File, fetched as soon as it exists, so "share" can open the share sheet inside the tap
 * (Safari refuses navigator.share once an await has used up the gesture). Returns a share function only when the
 * file is in hand and the browser can share files; otherwise undefined, and no share button is shown.
 * `onShared` runs only when the person completed the share, not when they closed the sheet.
 */
export function useShareFile(url: string | null | undefined, filename: string, onShared: () => void): (() => void) | undefined {
  const [file, setFile] = useState<File | null>(null);
  useEffect(() => {
    setFile(null);
    if (!url || !canShareVideo()) return;
    let live = true;
    void fetch(url)
      .then((r) => (r.ok ? r.blob() : Promise.reject(new Error(String(r.status)))))
      .then((b) => {
        if (live) setFile(new File([b], filename, { type: b.type || "video/mp4" }));
      })
      .catch(() => {}); // no file, no share button; download still works
    return () => {
      live = false;
    };
  }, [url, filename]);
  if (!file) return undefined;
  return () => {
    navigator
      .share({ files: [file] })
      .then(onShared)
      .catch(() => {}); // closed the sheet (AbortError) or the target refused: nothing to report
  };
}
