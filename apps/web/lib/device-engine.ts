"use client";
import type { Aspect, EditDoc, FaceSample, MediaStats, QcResult, ReframeKeyframe } from "@eyelore/core";
import { dbToGain, encodeWav, integratedLoudness, loudnessGainDb, mixSound, qcExport, smoothFaceTrack, sourceAt, TARGET_LUFS, toTimeline, truePeakDb, wordRms } from "@eyelore/core";
import { wasmVariant, WASM_VARIANTS, wordsFromChunks } from "./asr-words";
import { engineHooks } from "./engine-reach";
import { FrameSampler, frameTap, lumaPlane, mean, meanAbsDiff, measureAudio, SAMPLE_SIDE } from "./frame-sampler";
import type { WasmAsrMessage, WasmAsrRequest } from "./wasm-whisper.worker";
import { ModelDownloadError, resilientFetch, retryLine, type RetryEvent } from "./resilient-fetch";

/**
 * The on-device engine (free tier, ADR 0012): Whisper for word timings and @remotion/web-renderer for the export, both
 * in the visitor's browser. The clip is never uploaded. Convex still owns the project and edit model: the transcript
 * is sent there and autocut runs server-side from the same code the worker path uses.
 *
 * Whisper runs on WebGPU where the browser has it. Elsewhere (Firefox, older Safari, many phones) it runs on the CPU
 * in WebAssembly (ADR 0016): slower, same device, same Transcript. The render needs WebCodecs either way; without it
 * there is no on-device edit.
 */
export const DEVICE_MODEL = "base.en" as const;

/** Which Whisper does the listening: WebGPU (the fast path) or the CPU fallback in WebAssembly. */
export type Transcriber = "webgpu" | "wasm";
type Support = { ok: boolean; why?: string; transcriber?: Transcriber };
let supportPromise: Promise<Support> | null = null;

/** WebAssembly in a module worker, plus the audio decoder the 16 kHz resample uses (that part runs on the page). */
function canUseWasmWhisper(): boolean {
  return typeof WebAssembly === "object" && typeof Worker === "function" && typeof OfflineAudioContext === "function";
}

/** Can this browser edit locally, and which transcriber will listen? Cached for the page's lifetime. */
export function deviceSupport(): Promise<Support> {
  supportPromise ??= (async () => {
    try {
      const [{ canUseWhisperWebGpu }, { canRenderMediaOnWeb }] = await Promise.all([
        import("@remotion/whisper-webgpu"),
        import("@remotion/web-renderer"),
      ]);
      // "eyelore.engine" = "wasm" skips WebGPU even where it exists (tests and measurement; engine-reach.ts)
      const w = engineHooks().engine === "wasm" ? { supported: false, reason: "wasm forced" } : await canUseWhisperWebGpu();
      if (!w.supported && !canUseWasmWhisper()) return { ok: false, why: `whisper: ${w.reason ?? "unsupported"}; no wasm` };
      const r = await canRenderMediaOnWeb({ width: 1080, height: 1920, container: "mp4", videoCodec: "h264" });
      if (!r.canRender) return { ok: false, why: `render: ${r.issues.map((i) => i.type).join(", ")}` };
      return { ok: true, transcriber: w.supported ? "webgpu" : "wasm" };
    } catch (e) {
      return { ok: false, why: String(e).slice(0, 120) };
    }
  })();
  return supportPromise;
}

export type Transcript = { language: string; durationMs: number; words: { text: string; startMs: number; endMs: number; conf: number; rms?: number }[] };

/**
 * Audio → 16 kHz → Whisper (downloads the model once per device; it's cached after). Reports honest progress. Uses the
 * transcriber deviceSupport() chose; a forced "device" engine on a browser without support keeps the WebGPU path.
 */
export async function transcribeOnDevice(file: File, durationMs: number, onStage: (detail: string) => void): Promise<Transcript> {
  if (engineHooks().engine === "wasm" || (await deviceSupport()).transcriber === "wasm") return transcribeWasm(file, durationMs, onStage);
  const wh = await import("@remotion/whisper-webgpu");
  onStage("reading the sound · on this device");
  const audio = await wh.resampleTo16Khz({ file });
  const cached = await wh.isWhisperModelCached({ model: DEVICE_MODEL }).catch(() => false);
  if (!cached) {
    const net = await modelNet();
    const t0 = performance.now();
    // files already cached (a "try again", or a reload after the first file landed) count as done: the library only reports what it fetches
    const before = await cachedModelBytes();
    let gaveUp: unknown = null;
    net.listen({ retry: (e) => onStage(retryLine(e)), giveUp: (e) => (gaveUp = e) });
    try {
      await wh.downloadWhisperModel({
        model: DEVICE_MODEL,
        onProgress: (p) => {
          const done = Math.min(before + p.loadedBytes, p.totalBytes);
          onStage(`getting the editor ready · ${Math.round(done / 1e6)} of ${Math.round(p.totalBytes / 1e6)} MB · once per device`);
        },
      });
    } catch (e) {
      // cache.put rejects with the browser's generic "network error"; the downloader's own reason is the true one
      console.warn("[model] download failed", e);
      throw gaveUp ?? e;
    } finally {
      net.listen({});
    }
    // only a complete, verified set counts: the library checks every file is in the cache before resolving
    if (!(await wh.isWhisperModelCached({ model: DEVICE_MODEL }))) throw new Error("model not fully cached");
    console.info(`[model] ${JSON.stringify({ model: DEVICE_MODEL, ms: Math.round(performance.now() - t0), resumedFromBytes: before, retries: net.retries() })}`);
  }
  onStage("listening · on this device");
  const t0 = performance.now();
  const r = await wh.transcribe({ channelWaveform: audio, model: DEVICE_MODEL });
  const words = r.words
    .map((x) => ({ text: x.text.trim(), startMs: Math.max(0, Math.round(x.startInSeconds * 1000)), endMs: Math.max(0, Math.round(x.endInSeconds * 1000)), conf: 1 }))
    .filter((w) => w.text && w.endMs >= w.startMs);
  logAsr({ transcriber: "webgpu", model: DEVICE_MODEL, ms: Math.round(performance.now() - t0) }, words);
  // each word's loudness against the take (emphasis punch-ins); the 16 kHz audio is already in memory
  const rms = wordRms(audio, 16000, words);
  return { language: "en", durationMs, words: words.map((w, i) => ({ ...w, rms: rms[i]! })) };
}

type NetListener = { retry?: (e: RetryEvent) => void; giveUp?: (e: ModelDownloadError) => void };
let netPromise: Promise<{ listen: (l: NetListener) => void; retries: () => number }> | null = null;

/**
 * Every model file Transformers.js fetches on this page goes through resilientFetch (stall detection, retry, Range
 * resume, nothing short stored; resilient-fetch.ts). @remotion/whisper-webgpu downloads through the same `env.fetch`,
 * so its host, file list and cache keys stay its own. Installed once per page.
 * Lab hook: localStorage "eyelore.lab-stall" = a byte offset makes the first read past it hang once (a dropped connection).
 */
function modelNet() {
  netPromise ??= (async () => {
    const { env } = await import("@huggingface/transformers");
    let listener: NetListener = {};
    let retries = 0;
    const stall = Number(hookValue("eyelore.lab-stall"));
    env.fetch = resilientFetch({
      fetch: env.fetch as typeof fetch,
      stallOnceAt: Number.isFinite(stall) && stall > 0 ? stall : null,
      onRetry: (e) => {
        retries++;
        console.warn(`[model] ${JSON.stringify({ retry: e.attempt, of: e.max, reason: e.reason, gotMB: +(e.got / 1e6).toFixed(1), file: e.url.split("/").pop() })}`);
        listener.retry?.(e);
      },
      onGiveUp: (e) => listener.giveUp?.(e),
    });
    return { listen: (l: NetListener) => void (listener = l), retries: () => retries };
  })();
  return netPromise;
}

/** Bytes of the WebGPU model already in the cache (whole files only: a short one is never stored). */
async function cachedModelBytes(): Promise<number> {
  try {
    const { env } = await import("@huggingface/transformers");
    const cache = await caches.open(env.cacheKey);
    let n = 0;
    for (const req of await cache.keys()) {
      if (!req.url.startsWith("https://remotion.media/") || !req.url.includes(`whisper-${DEVICE_MODEL}_timestamped`)) continue;
      n += Number((await cache.match(req))?.headers.get("content-length")) || 0;
    }
    return n;
  } catch {
    return 0;
  }
}

/**
 * The CPU fallback (ADR 0016): the same 16 kHz audio, Whisper in WebAssembly inside a worker so the page stays
 * responsive, the same Transcript out. The model comes from the Hugging Face Hub once per device, the browser's cache
 * after that.
 */
async function transcribeWasm(file: File, durationMs: number, onStage: (detail: string) => void): Promise<Transcript> {
  const name = wasmVariant(hookValue("eyelore.wasm-model"), durationMs);
  const variant = WASM_VARIANTS[name];
  const { resampleTo16Khz } = await import("@remotion/whisper-webgpu"); // OfflineAudioContext only; no WebGPU involved
  onStage("reading the sound · on this device");
  const audio = await resampleTo16Khz({ file });
  const worker = new Worker(new URL("./wasm-whisper.worker.ts", import.meta.url), { type: "module" });
  try {
    const done = await new Promise<Extract<WasmAsrMessage, { type: "done" }>>((resolve, reject) => {
      worker.onerror = (e) => reject(new Error(e.message || "the listening worker didn't start"));
      worker.onmessage = (e: MessageEvent<WasmAsrMessage>) => {
        const m = e.data;
        if (m.type === "progress") {
          const total = Math.max(m.total / 1e6, variant.mb);
          onStage(`getting the editor ready · ${Math.round(Math.min(m.loaded / 1e6, total))} of ${Math.round(total)} MB · once per device`);
        } else if (m.type === "retry") onStage(retryLine(m));
        else if (m.type === "listening") onStage("listening · on this device");
        else if (m.type === "done") resolve(m);
        else if (m.type === "error") {
          console.warn("[model] wasm worker failed", m.message);
          reject(m.reason ? new ModelDownloadError(m.reason, variant.modelId) : new Error(m.message));
        }
      };
      // the worker gets a copy; this one stays for the loudness pass below
      const stall = Number(hookValue("eyelore.lab-stall"));
      const request: WasmAsrRequest = { audio: audio.slice(), variant, stallAt: Number.isFinite(stall) && stall > 0 ? stall : null };
      worker.postMessage(request, [request.audio.buffer]);
    });
    const words = wordsFromChunks(done.chunks, audio.length / 16000);
    logAsr({ transcriber: "wasm", model: name, threads: done.threads, isolated: done.isolated, loadMs: done.loadMs, ms: done.asrMs }, words);
    const rms = wordRms(audio, 16000, words);
    return { language: "en", durationMs, words: words.map((w, i) => ({ ...w, rms: rms[i]! })) };
  } finally {
    worker.terminate();
  }
}

/**
 * What listened and how long it took, like the [sound] and [qc] lines: numbers only. The words are added only in the
 * lab (localStorage "eyelore.lab" = "1", set by scripts/lab/device-flow.mjs), so what someone said never reaches a log.
 */
function logAsr(m: Record<string, string | number | boolean>, words: { text: string }[]) {
  const text = hookValue("eyelore.lab") === "1" ? { text: words.map((w) => w.text).join(" ") } : {};
  console.info(`[asr] ${JSON.stringify({ ...m, words: words.length, ...text })}`);
}

function hookValue(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked: no override
  }
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

/** What the export quality check measured while rendering, and what it cost. */
export type DeviceMeasure = { stats: MediaStats; timings: { renderMs: number; sampleMs: number; sampledFrames: number; frames: number; audioMs: number } };

/**
 * Render the current edit to an MP4 in the browser. Returns a Blob the page downloads; nothing is uploaded. While it
 * renders, frames are sampled for the quality check (frame-sampler.ts); afterwards the file's own sound is measured.
 * The sound is mixed here first (J/L cuts, fades, -14 LUFS; mixOnDevice) and handed to CutWeb as a WAV.
 */
export async function renderOnDevice(doc: EditDoc, src: string, aspect: Aspect, watermark: boolean, onProgress: (p: number) => void, signal?: AbortSignal, stills: Record<string, string> = {}): Promise<{ blob: Blob; durationMs: number; sound: SoundReport } & DeviceMeasure> {
  const [{ renderMediaOnWeb }, { CutWeb }] = await Promise.all([import("@remotion/web-renderer"), import("./cut-web")]);
  const d: EditDoc = { ...doc, aspect };
  const durationMs = toTimeline(d).durationMs;
  const [width, height] = SIZE[aspect];
  const mix = await mixOnDevice(d, src);
  console.info(`[sound] ${JSON.stringify(mix.report)}`);
  const sampler = new FrameSampler();
  const t0 = performance.now();
  const { getBlob } = await renderMediaOnWeb({
    composition: { id: "Cut", component: CutWeb as never, durationInFrames: Math.max(30, Math.round((durationMs / 1000) * 30)), fps: 30, width, height },
    inputProps: { doc: d, src, watermark, stills, ...(mix.url ? { sound: mix.url } : {}) },
    container: "mp4",
    videoCodec: "h264",
    onProgress: (p: { progress: number }) => onProgress(p.progress),
    onFrame: frameTap(sampler, width, height),
    signal,
  } as never);
  try {
    const blob = await getBlob();
    const renderMs = performance.now() - t0;
    // the file's length and sound come from the file itself (the audio track's decoded length)
    const a0 = performance.now();
    const audio = await measureAudio(blob);
    const audioMs = performance.now() - a0;
    const measured = audio?.durationMs ?? Math.round((sampler.frames * 1000) / 30);
    const stats = sampler.stats(measured, audio?.levels);
    return { blob, durationMs, sound: mix.report, stats, timings: { renderMs: Math.round(renderMs), sampleMs: Math.round(sampler.ms), sampledFrames: sampler.luma.length, frames: sampler.frames, audioMs: Math.round(audioMs) } };
  } finally {
    if (mix.url) URL.revokeObjectURL(mix.url);
  }
}

/**
 * The quality check on a device export. When the file shows black, a freeze or clipping, the take is measured at the
 * same moments (frames from the local clip, its sound) so the person's own footage isn't blamed on the render; only
 * then, so a clean export pays nothing more. Returns the decision and the extra time it took.
 */
export async function checkDeviceExport(doc: EditDoc, src: string, stats: MediaStats): Promise<{ result: QcResult; sourceMs: number }> {
  const first = qcExport(doc, stats);
  const suspect = first.issues.filter((i) => i.code === "black_frames" || i.code === "frozen_frames" || i.code === "clipping");
  if (!suspect.length) return { result: first, sourceMs: 0 };
  const t0 = performance.now();
  const filled: MediaStats = { ...stats };
  const pictures = suspect.filter((i) => i.code !== "clipping");
  if (pictures.length) {
    const segs = toTimeline(doc).segments;
    const step = stats.sampleEveryMs;
    const want = new Set<number>();
    for (const i of pictures) for (let k = Math.max(0, Math.floor(i.atMs / step) - 1); k < Math.min(stats.luma.length, Math.ceil((i.atMs + i.spanMs) / step)); k++) want.add(k);
    // unmeasured moments read as bright and moving (NaN fails every "dark" or "still" test): the strict reading
    const luma = Array<number>(stats.luma.length).fill(NaN);
    const diff = Array<number>(stats.diff.length).fill(NaN);
    const planes = await sampleTake(src, [...want].sort((x, y) => x - y).map((k) => ({ k, srcMs: sourceAt(segs, k * step)?.srcMs })));
    for (const [k, plane] of planes) {
      luma[k] = mean(plane);
      const prev = planes.get(k - 1);
      if (prev) diff[k] = meanAbsDiff(plane, prev);
    }
    Object.assign(filled, { sourceLuma: luma, sourceDiff: diff });
  }
  if (suspect.some((i) => i.code === "clipping") && filled.audio) {
    const take = await measureAudio(await (await fetch(src)).blob());
    if (take) filled.audio = { ...filled.audio, sourcePeakDb: take.levels.peakDb };
  }
  return { result: qcExport(doc, filled), sourceMs: Math.round(performance.now() - t0) };
}

/** Luma planes of the local take at the given source times, drawn at the sampler's size. */
async function sampleTake(src: string, at: { k: number; srcMs?: number }[]): Promise<Map<number, Float32Array>> {
  const out = new Map<number, Float32Array>();
  const video = document.createElement("video");
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = src;
  await new Promise<void>((res, rej) => {
    video.onloadeddata = () => res();
    video.onerror = () => rej(new Error("could not read the take"));
  });
  const scale = SAMPLE_SIDE / Math.max(video.videoWidth, video.videoHeight);
  const canvas = new OffscreenCanvas(Math.max(1, Math.round(video.videoWidth * scale)), Math.max(1, Math.round(video.videoHeight * scale)));
  const g = canvas.getContext("2d", { willReadFrequently: true })!;
  for (const { k, srcMs } of at) {
    if (srcMs === undefined) continue;
    await new Promise<void>((res) => {
      video.onseeked = () => res();
      video.currentTime = srcMs / 1000;
    });
    g.drawImage(video, 0, 0, canvas.width, canvas.height);
    out.set(k, lumaPlane(g.getImageData(0, 0, canvas.width, canvas.height).data));
  }
  video.removeAttribute("src");
  return out;
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
