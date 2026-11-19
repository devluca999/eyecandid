/**
 * The CPU (WebAssembly) transcriber's pieces that don't need a browser: which Whisper build it downloads, and how the
 * transformers.js word chunks become the Transcript words the rest of the app already uses (device-engine.ts).
 */

/** One word as transformers.js returns it with `return_timestamps: "word"`: text with its leading space, [start, end] in s. */
export type AsrChunk = { text: string; timestamp: [number | null, number | null] };

export type TranscriptWord = { text: string; startMs: number; endMs: number; conf: number };

/**
 * Chunks → words, the same rules the WebGPU path gets from @remotion/whisper-webgpu's transcribe(): a missing or
 * backwards end falls back to the next word's start (or the end of the audio), everything is clamped to the audio,
 * text is trimmed and empty words are dropped. A missing start takes the previous word's end (Remotion throws there;
 * one unreadable word shouldn't lose the take). Whisper gives no per-word confidence, so conf is 1 on both paths.
 */
export function wordsFromChunks(chunks: readonly AsrChunk[], audioSeconds: number): TranscriptWord[] {
  const dur = Math.max(0, audioSeconds);
  const clamp = (s: number) => Math.max(0, Math.min(s, dur));
  const starts: number[] = [];
  let prevEnd = 0;
  for (const c of chunks) {
    const [s, e] = c.timestamp;
    const start = clamp(s !== null && Number.isFinite(s) ? s : prevEnd);
    starts.push(start);
    if (e !== null && Number.isFinite(e) && e >= start) prevEnd = clamp(e);
    else prevEnd = start;
  }
  const words: TranscriptWord[] = [];
  chunks.forEach((c, i) => {
    const start = starts[i]!;
    const modelEnd = c.timestamp[1];
    const next = starts[i + 1];
    const fallback = next === undefined || next < start ? dur : next;
    const end = Math.max(start, clamp(modelEnd !== null && Number.isFinite(modelEnd) && modelEnd >= start ? modelEnd : fallback));
    const text = c.text.trim();
    if (!text) return;
    words.push({ text, startMs: Math.round(start * 1000), endMs: Math.round(end * 1000), conf: 1 });
  });
  return words;
}

type Dtype = "q8" | "q4" | "fp32";
export type WasmVariant = { modelId: string; dtype: Dtype | Record<string, Dtype>; mb: number };

/**
 * The Whisper builds the CPU path can use (onnx-community word-timestamped exports). `mb` is the whole first-visit
 * download as transformers.js reported it (encoder, merged decoder, config and tokenizer). Measured in Chrome with WASM
 * forced on an M1 Mac; see ADR 0016.
 */
export const WASM_VARIANTS = {
  "base.en:q8": { modelId: "onnx-community/whisper-base.en_timestamped", dtype: "q8", mb: 80 },
  "base.en:q4": { modelId: "onnx-community/whisper-base.en_timestamped", dtype: "q4", mb: 145 },
  "tiny.en:q8": { modelId: "onnx-community/whisper-tiny.en_timestamped", dtype: "q8", mb: 44 },
  "tiny.en:q4": { modelId: "onnx-community/whisper-tiny.en_timestamped", dtype: "q4", mb: 99 },
} as const satisfies Record<string, WasmVariant>;

export type WasmVariantName = keyof typeof WASM_VARIANTS;

/**
 * A clip that fits one 30 s Whisper window gets base.en (the closest to the WebGPU words); a longer one needs two or
 * three windows, which took base.en 29-42 s on the CPU, so it gets tiny.en (about twice as fast, a few more slips).
 */
export const ONE_WINDOW_MS = 30_000;

/** The build for this clip; the measurement hook (localStorage "eyelore.wasm-model") wins when it names a known one. */
export function wasmVariant(hook: string | null, durationMs: number): WasmVariantName {
  if (hook !== null && Object.hasOwn(WASM_VARIANTS, hook)) return hook as WasmVariantName;
  return durationMs > ONE_WINDOW_MS ? "tiny.en:q8" : "base.en:q8";
}
