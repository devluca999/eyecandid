/**
 * Whisper on the CPU (WebAssembly), off the main thread: the transcriber for browsers without WebGPU (ADR 0016). Takes
 * 16 kHz mono audio (decoded on the page: OfflineAudioContext doesn't exist in workers), downloads the model once
 * per device (transformers.js keeps it in the Cache API) and returns the word chunks. One message in, one result out;
 * the page terminates the worker afterwards so the model's memory goes with it.
 */
import { env, ModelRegistry, pipeline } from "@huggingface/transformers";
import type { AsrChunk, WasmVariant } from "./asr-words";

export type WasmAsrRequest = { audio: Float32Array; variant: WasmVariant };
export type WasmAsrMessage =
  | { type: "cached"; cached: boolean }
  | { type: "progress"; loaded: number; total: number }
  | { type: "listening"; loadMs: number }
  | { type: "done"; chunks: AsrChunk[]; loadMs: number; asrMs: number; threads: number; isolated: boolean }
  | { type: "error"; message: string };

// typed by hand: the app compiles against the DOM lib, and adding the webworker lib beside it clashes
const ctx = self as unknown as { postMessage(m: WasmAsrMessage): void; onmessage: ((e: MessageEvent<WasmAsrRequest>) => void) | null; crossOriginIsolated: boolean };
const post = (m: WasmAsrMessage) => ctx.postMessage(m);

env.allowLocalModels = false; // models come from the Hub (and the browser's cache after the first visit), never /models on our origin

ctx.onmessage = async (e: MessageEvent<WasmAsrRequest>) => {
  const { audio, variant } = e.data;
  try {
    const opts = { device: "wasm" as const, dtype: variant.dtype };
    const cached = await ModelRegistry.is_pipeline_cached("automatic-speech-recognition", variant.modelId, opts).catch(() => false);
    post({ type: "cached", cached });
    const t0 = performance.now();
    const asr = await pipeline("automatic-speech-recognition", variant.modelId, {
      ...opts,
      progress_callback: (p: { status: string; loaded?: number; total?: number }) => {
        if (p.status === "progress_total" && !cached) post({ type: "progress", loaded: p.loaded ?? 0, total: p.total ?? 0 });
      },
    });
    const loadMs = Math.round(performance.now() - t0);
    post({ type: "listening", loadMs });
    const t1 = performance.now();
    // the same windows as the WebGPU path: 30 s chunks, 5 s stride (a 60 s clip is three windows)
    const out = (await asr(audio, { return_timestamps: "word", chunk_length_s: 30, stride_length_s: 5 })) as { chunks?: AsrChunk[] };
    const asrMs = Math.round(performance.now() - t1);
    await asr.dispose();
    const threads = Number(env.backends.onnx?.wasm?.numThreads ?? 0);
    post({ type: "done", chunks: (out.chunks ?? []).map((c) => ({ text: c.text, timestamp: [c.timestamp[0], c.timestamp[1]] })), loadMs, asrMs, threads, isolated: ctx.crossOriginIsolated });
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
