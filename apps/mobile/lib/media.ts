import { Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import { createVideoPlayer } from "expo-video";

export type ClipMeta = { w: number; h: number; durationMs: number };

/** Read a clip's real size and length on the device (camera recordings come back as a bare file). */
export function probeVideo(uri: string): Promise<ClipMeta> {
  return new Promise((resolve, reject) => {
    const player = createVideoPlayer(uri);
    const done = (fn: () => void) => {
      clearTimeout(timer);
      sub.remove();
      player.release();
      fn();
    };
    const timer = setTimeout(() => done(() => reject(new Error("couldn't read that clip"))), 10_000);
    const sub = player.addListener("sourceLoad", (e) => {
      const size = e.availableVideoTracks[0]?.size;
      if (!size || !e.duration) return done(() => reject(new Error("that file doesn't look like a video")));
      done(() => resolve({ w: size.width, h: size.height, durationMs: Math.round(e.duration * 1000) }));
    });
  });
}

/** how long a background session may sit without sending a byte before the upload moves in-app */
const BACKGROUND_START_MS = 8_000;

/**
 * Upload with real progress and three tries. On iOS the first try is a background URLSession, so the upload keeps
 * going when the app is backgrounded. The OS schedules those at its own discretion (on the iOS simulator we
 * never saw one start), so if nothing has been sent after a few seconds the upload is restarted as an ordinary in-app request.
 * Android uploads in-process (TODO: a foreground service for long clips).
 * TODO(resumable): Convex upload URLs take one request; true resume needs chunked storage behind MediaStore.
 */
export async function uploadClip(getUrl: () => Promise<string>, uri: string, contentType: string, onProgress: (p: number) => void): Promise<string> {
  let lastErr: unknown;
  let background = Platform.OS === "ios";
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      let sent = 0;
      let stalled = false;
      const task = FileSystem.createUploadTask(
        await getUrl(),
        uri,
        {
          httpMethod: "POST",
          uploadType: FileSystem.FileSystemUploadType.BINARY_CONTENT,
          sessionType: background ? FileSystem.FileSystemSessionType.BACKGROUND : FileSystem.FileSystemSessionType.FOREGROUND,
          headers: { "content-type": contentType },
        },
        (p) => {
          sent = p.totalBytesSent;
          if (p.totalBytesExpectedToSend > 0) onProgress(p.totalBytesSent / p.totalBytesExpectedToSend);
        },
      );
      const watchdog = background
        ? setTimeout(() => {
            if (sent > 0) return;
            stalled = true;
            void task.cancelAsync().catch(() => {});
          }, BACKGROUND_START_MS)
        : null;
      let res: Awaited<ReturnType<typeof task.uploadAsync>>;
      try {
        res = await task.uploadAsync();
      } finally {
        if (watchdog) clearTimeout(watchdog);
      }
      if (res && res.status < 300) return (JSON.parse(res.body) as { storageId: string }).storageId;
      if (stalled) {
        background = false;
        attempt--; // not a failed try: the background session never started
        continue;
      }
      throw new Error(`upload ${res?.status ?? "cancelled"}`);
    } catch (e) {
      if (background) {
        background = false; // whatever went wrong, the next try is in-app
        lastErr = e;
        continue;
      }
      lastErr = e;
      await new Promise((r) => setTimeout(r, 800 * 2 ** attempt));
    }
  }
  throw lastErr;
}

/** Fetch a finished export next to the app's cache so it can be saved and shared. */
export async function downloadExport(url: string, name: string): Promise<string> {
  const target = `${FileSystem.cacheDirectory}${name}.mp4`;
  const res = await FileSystem.downloadAsync(url, target);
  if (res.status >= 300) throw new Error(`download ${res.status}`);
  return res.uri;
}

export async function fileSize(uri: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(uri);
  return info.exists ? info.size : 0;
}
