"use client";
import type { Aspect, EditDoc } from "@eyelore/core";
import { toTimeline } from "@eyelore/core";

/**
 * The on-device engine (free tier, ADR 0012): Whisper on WebGPU for word timings and @remotion/web-renderer for the
 * export, both in the visitor's browser. The clip is never uploaded. Convex still owns the project and edit model:
 * the transcript is sent there and autocut runs server-side from the same code the worker path uses.
 */
export const DEVICE_MODEL = "base.en" as const;

type Support = { ok: boolean; why?: string };
let supportPromise: Promise<Support> | null = null;

/** Can this browser edit locally? Cached for the page's lifetime. */
export function deviceSupport(): Promise<Support> {
  supportPromise ??= (async () => {
    try {
      const [{ canUseWhisperWebGpu }, { canRenderMediaOnWeb }] = await Promise.all([
        import("@remotion/whisper-webgpu"),
        import("@remotion/web-renderer"),
      ]);
      const w = await canUseWhisperWebGpu();
      if (!w.supported) return { ok: false, why: `whisper: ${w.reason ?? "unsupported"}` };
      const r = await canRenderMediaOnWeb({ width: 1080, height: 1920, container: "mp4", videoCodec: "h264" });
      if (!r.canRender) return { ok: false, why: `render: ${r.issues.map((i) => i.type).join(", ")}` };
      return { ok: true };
    } catch (e) {
      return { ok: false, why: String(e).slice(0, 120) };
    }
  })();
  return supportPromise;
}

export type Transcript = { language: string; durationMs: number; words: { text: string; startMs: number; endMs: number; conf: number }[] };

/** Audio → 16 kHz → Whisper (downloads the model once per device; it's cached after). Reports honest progress. */
export async function transcribeOnDevice(file: File, durationMs: number, onStage: (detail: string) => void): Promise<Transcript> {
  const wh = await import("@remotion/whisper-webgpu");
  onStage("reading the sound · on this device");
  const audio = await wh.resampleTo16Khz({ file });
  const cached = await wh.isWhisperModelCached({ model: DEVICE_MODEL }).catch(() => false);
  if (!cached) {
    await wh.downloadWhisperModel({
      model: DEVICE_MODEL,
      onProgress: (p) => onStage(`getting the editor ready · ${Math.round(p.loadedBytes / 1e6)} of ${Math.round(p.totalBytes / 1e6)} MB · once per device`),
    });
  }
  onStage("listening · on this device");
  const r = await wh.transcribe({ channelWaveform: audio, model: DEVICE_MODEL });
  const words = r.words
    .map((x) => ({ text: x.text.trim(), startMs: Math.max(0, Math.round(x.startInSeconds * 1000)), endMs: Math.max(0, Math.round(x.endInSeconds * 1000)), conf: 1 }))
    .filter((w) => w.text && w.endMs >= w.startMs);
  return { language: "en", durationMs, words };
}

const SIZE: Record<Aspect, [number, number]> = { "9:16": [1080, 1920], "4:5": [1080, 1350], "1:1": [1080, 1080], "16:9": [1920, 1080] };

/** Render the current edit to an MP4 in the browser. Returns a Blob the page downloads; nothing is uploaded. */
export async function renderOnDevice(doc: EditDoc, src: string, aspect: Aspect, watermark: boolean, onProgress: (p: number) => void, signal?: AbortSignal): Promise<{ blob: Blob; durationMs: number }> {
  const [{ renderMediaOnWeb }, { CutWeb }] = await Promise.all([import("@remotion/web-renderer"), import("./cut-web")]);
  const d: EditDoc = { ...doc, aspect };
  const durationMs = toTimeline(d).durationMs;
  const [width, height] = SIZE[aspect];
  const { getBlob } = await renderMediaOnWeb({
    composition: { id: "Cut", component: CutWeb as never, durationInFrames: Math.max(30, Math.round((durationMs / 1000) * 30)), fps: 30, width, height },
    inputProps: { doc: d, src, watermark },
    container: "mp4",
    videoCodec: "h264",
    onProgress: (p: { progress: number }) => onProgress(p.progress),
    signal,
  } as never);
  return { blob: await getBlob(), durationMs };
}
