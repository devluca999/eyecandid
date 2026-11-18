"use client";
import type { Aspect, EditDoc, FaceSample, ReframeKeyframe } from "@eyelore/core";
import { dbToGain, encodeWav, integratedLoudness, loudnessGainDb, mixSound, smoothFaceTrack, TARGET_LUFS, toTimeline, truePeakDb, wordRms } from "@eyelore/core";

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

export type Transcript = { language: string; durationMs: number; words: { text: string; startMs: number; endMs: number; conf: number; rms?: number }[] };

/** Audio → 16 kHz → Whisper (downloads the model once per device; it's cached after). Reports honest progress. */
export async function transcribeOnDevice(file: File, durationMs: number, onStage: (detail: string) => void): Promise<Transcript> {
  const wh = await import("@remotion/whisper-webgpu");
  onStage("reading the sound · on this device");
  const audio = await wh.resampleTo16Khz({ file });
  const cached = await wh.isWhisperModelCached({ model: DEVICE_MODEL }).catch(() => false);
  if (!cached) {
    await wh.downloadWhisperModel({
      model: DEVICE_MODEL,
      onProgress: (p) => onStage(`getting the editor ready · ${Math.round(Math.min(p.loadedBytes, p.totalBytes) / 1e6)} of ${Math.round(p.totalBytes / 1e6)} MB · once per device`),
    });
  }
  onStage("listening · on this device");
  const r = await wh.transcribe({ channelWaveform: audio, model: DEVICE_MODEL });
  const words = r.words
    .map((x) => ({ text: x.text.trim(), startMs: Math.max(0, Math.round(x.startInSeconds * 1000)), endMs: Math.max(0, Math.round(x.endInSeconds * 1000)), conf: 1 }))
    .filter((w) => w.text && w.endMs >= w.startMs);
  // each word's loudness against the take (emphasis punch-ins); the 16 kHz audio is already in memory
  const rms = wordRms(audio, 16000, words);
  return { language: "en", durationMs, words: words.map((w, i) => ({ ...w, rms: rms[i]! })) };
}

const SIZE: Record<Aspect, [number, number]> = { "9:16": [1080, 1920], "4:5": [1080, 1350], "1:1": [1080, 1080], "16:9": [1920, 1080] };

export const SOUND_RATE = 48000;
const decoded = new Map<string, Promise<Float32Array[]>>();

/** The clip's sound at 48 kHz stereo (mono is doubled: the export is stereo, and loudness is measured as exported). Once per src. */
function decodeSound(src: string): Promise<Float32Array[]> {
  let p = decoded.get(src);
  if (!p) {
    p = (async () => {
      const bytes = await (await fetch(src)).arrayBuffer();
      const buf = await new OfflineAudioContext(2, 1, SOUND_RATE).decodeAudioData(bytes);
      const chs = Array.from({ length: buf.numberOfChannels }, (_, c) => buf.getChannelData(c));
      return chs.length === 1 ? [chs[0]!, chs[0]!] : chs.slice(0, 2);
    })();
    p.catch(() => decoded.delete(src));
    decoded.set(src, p);
  }
  return p;
}

export type SoundReport = { mixed: boolean; measuredLufs: number; truePeakDb: number; gainDb: number; expectedLufs: number; why?: string };

/**
 * The export's sound, mixed here: the timeline's sound pieces (J/L cuts, sample-accurate fades at every cut) from the
 * decoded clip, then one gain to -14 LUFS integrated, capped so the true peak stays under -1 dBTP. Returns a WAV URL
 * for CutWeb, or null (with why) when the browser can't decode the clip's sound; the render then falls back to
 * frame-level fades and no loudness change.
 */
export async function mixOnDevice(d: EditDoc, src: string): Promise<{ url: string | null; report: SoundReport }> {
  try {
    const tl = toTimeline(d);
    const chs = await decodeSound(src);
    const sources = Object.fromEntries(d.clips.map((c) => [c.mediaId, chs]));
    const dry = mixSound(tl.sound, sources, SOUND_RATE, tl.durationMs);
    const measuredLufs = integratedLoudness(dry, SOUND_RATE);
    const tp = truePeakDb(dry);
    const gainDb = loudnessGainDb(measuredLufs, tp);
    const g = dbToGain(gainDb);
    for (const ch of dry) for (let i = 0; i < ch.length; i++) ch[i] = ch[i]! * g;
    const url = URL.createObjectURL(new Blob([encodeWav(dry, SOUND_RATE) as BlobPart], { type: "audio/wav" }));
    return { url, report: { mixed: true, measuredLufs, truePeakDb: tp, gainDb, expectedLufs: Number.isFinite(measuredLufs) ? measuredLufs + gainDb : TARGET_LUFS } };
  } catch (e) {
    return { url: null, report: { mixed: false, measuredLufs: NaN, truePeakDb: NaN, gainDb: 0, expectedLufs: NaN, why: String(e).slice(0, 120) } };
  }
}

/** Render the current edit to an MP4 in the browser. Returns a Blob the page downloads; nothing is uploaded. */
export async function renderOnDevice(doc: EditDoc, src: string, aspect: Aspect, watermark: boolean, onProgress: (p: number) => void, signal?: AbortSignal, stills: Record<string, string> = {}): Promise<{ blob: Blob; durationMs: number; sound: SoundReport }> {
  const [{ renderMediaOnWeb }, { CutWeb }] = await Promise.all([import("@remotion/web-renderer"), import("./cut-web")]);
  const d: EditDoc = { ...doc, aspect };
  const durationMs = toTimeline(d).durationMs;
  const [width, height] = SIZE[aspect];
  const mix = await mixOnDevice(d, src);
  console.info(`[sound] ${JSON.stringify(mix.report)}`);
  const { getBlob } = await renderMediaOnWeb({
    composition: { id: "Cut", component: CutWeb as never, durationInFrames: Math.max(30, Math.round((durationMs / 1000) * 30)), fps: 30, width, height },
    inputProps: { doc: d, src, watermark, stills, ...(mix.url ? { sound: mix.url } : {}) },
    container: "mp4",
    videoCodec: "h264",
    onProgress: (p: { progress: number }) => onProgress(p.progress),
    signal,
  } as never);
  try {
    return { blob: await getBlob(), durationMs, sound: mix.report };
  } finally {
    if (mix.url) URL.revokeObjectURL(mix.url);
  }
}

/**
 * Face-centred reframing in the browser (free tier). Samples the local clip at ~4 fps (capped), runs MediaPipe's
 * BlazeFace short-range detector (self-hosted under /mediapipe, never a CDN), takes the largest face per frame and
 * hands the samples to smoothFaceTrack, the twin of the server's reframe handler. Runs after the edit is ready.
 */
const MAX_FACE_FRAMES = 240;

export async function faceTrackOnDevice(file: File, durationMs: number): Promise<{ keyframes: ReframeKeyframe[]; faces: number; frames: number; ms: number }> {
  const t0 = performance.now();
  const { FaceDetector, FilesetResolver } = await import("@mediapipe/tasks-vision");
  const fileset = await FilesetResolver.forVisionTasks("/mediapipe");
  const detector = await FaceDetector.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: "/mediapipe/blaze_face_short_range.tflite", delegate: "CPU" },
    runningMode: "IMAGE",
    minDetectionConfidence: 0.5,
  });
  const url = URL.createObjectURL(file);
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = url;
  try {
    await new Promise<void>((res, rej) => {
      video.onloadeddata = () => res();
      video.onerror = () => rej(new Error("could not read the video"));
    });
    const dur = (Number.isFinite(video.duration) && video.duration > 0 ? video.duration * 1000 : durationMs) || 0;
    const step = Math.max(250, dur / MAX_FACE_FRAMES);
    // downscale: BlazeFace short-range works on 128px anyway
    const scale = Math.min(1, 480 / Math.max(video.videoWidth, video.videoHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(video.videoWidth * scale));
    canvas.height = Math.max(1, Math.round(video.videoHeight * scale));
    const g = canvas.getContext("2d");
    if (!g) throw new Error("no canvas");
    const samples: FaceSample[] = [];
    for (let ms = 0; ms < dur; ms += step) {
      await new Promise<void>((res) => {
        video.onseeked = () => res();
        video.currentTime = Math.min(ms, Math.max(0, dur - 50)) / 1000;
      });
      g.drawImage(video, 0, 0, canvas.width, canvas.height);
      let best: FaceSample["face"] = null;
      let area = 0;
      for (const d of detector.detect(canvas).detections) {
        const b = d.boundingBox;
        if (b && b.width * b.height > area) {
          area = b.width * b.height;
          best = { x: b.originX / canvas.width, y: b.originY / canvas.height, w: b.width / canvas.width, h: b.height / canvas.height };
        }
      }
      samples.push({ ms: Math.round(ms), face: best });
      // let the page breathe between frames: this runs while the user is already editing
      await new Promise((r) => setTimeout(r, 0));
    }
    const out = smoothFaceTrack(samples);
    return { ...out, frames: samples.length, ms: Math.round(performance.now() - t0) };
  } finally {
    detector.close();
    URL.revokeObjectURL(url);
  }
}
