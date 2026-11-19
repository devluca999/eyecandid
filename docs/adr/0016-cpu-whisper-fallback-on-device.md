# 0016 · Browsers without WebGPU transcribe on the CPU, on the device

**Status:** accepted · 2026-11-19

**Context.** The free edit runs on the visitor's device (ADR 0012), but `deviceSupport()` refused any browser without WebGPU: Firefox, older Safari and many phones. Those visitors fell back to the server worker, and no worker runs in production (Modal is at its spend cap), so they waited on "no engine is running right now". Only transcription needed WebGPU. Autocut and captions are TypeScript, reframe is MediaPipe on the CPU, and the render (`@remotion/web-renderer`) needs only WebCodecs.

**Decision.**
- `deviceSupport()` now has three outcomes:
  - WebGPU Whisper is available: the WebGPU path, unchanged.
  - Otherwise, if the render check passes and the browser has WebAssembly, workers and `OfflineAudioContext`: the CPU transcriber.
  - Otherwise: not supported, which keeps the existing server path and the honest line.
  
  The result carries `transcriber: "webgpu" | "wasm"`, and `.ok` means what it did before.
- The CPU transcriber is `@huggingface/transformers` (already a dependency: `@remotion/whisper-webgpu` is built on it) with `device: "wasm"`. It runs in a module worker (`lib/wasm-whisper.worker.ts`) so the page stays responsive. The 16 kHz resample runs on the page with Remotion's `resampleTo16Khz`, which uses only `OfflineAudioContext` (that API doesn't exist in workers). It uses the same 30 s windows with a 5 s stride as the WebGPU path, and word timestamps. `wordsFromChunks` (`lib/asr-words.ts`, unit tested) maps the chunks to the same `Transcript`, with `wordRms` loudness, so everything downstream is unchanged.
- **Default build: `onnx-community/whisper-base.en_timestamped`, q8, a 77 MB download from the Hugging Face Hub, once per device.** Chosen by measurement (below). It was the closest to the WebGPU base.en words, the smallest base build, and inside 30 s cached for a 55 s clip on a laptop.
- Hooks: localStorage `eyelore.engine = "wasm"` forces the CPU transcriber, and `eyelore.wasm-model` picks another measured build (`base.en:q4`, `tiny.en:q8`, `tiny.en:q4`). `scripts/lab/device-flow.mjs` sets these from `LAB_ENGINE` and `LAB_WASM_MODEL`.

**Measured** (Chrome via Playwright, Apple-silicon Mac, WASM forced, `crossOriginIsolated` false, so ORT runs on 1 thread):

| build | download | drop→ready, 21 s clip, first visit / cached | 55 s clip, cached | words differing from WebGPU base.en (21 s / 55 s) |
| --- | --- | --- | --- | --- |
| base.en q8 (default) | 77 MB | 18.5 s / 8.3 s | 29.3 s | 1/64 · 3/162 |
| base.en q4 | 142 MB | 25.4 s / 12.0 s | 40.1 s | 2/64 · 11/162 |
| tiny.en q8 | 41 MB | 10.8 s / 5.7 s | 17.1 s | 4/64 · 5/162 |
| tiny.en q4 | 96 MB | 16.4 s / 6.1 s | not run | 2/64 |
| WebGPU base.en (today) | 206 MB | 26.8 s / 6.5 s | 17.4 s | (reference) |

**Consequences.**
- Free edits work without WebGPU and without any server, as long as the browser has WebCodecs for the render. A browser without WebCodecs still gets the honest refusal or the server path.
- Model files come from huggingface.co (the WebGPU build comes from remotion.media). There is no account, key or cost. The site has no CSP that would block it.
- Without COOP/COEP headers the page isn't cross-origin isolated, so ONNX Runtime runs single-threaded. Isolating the site could make this faster, but it touches every third-party embed, so it's left for its own decision.
- A 55–60 s clip sits right at 30 s on a fast laptop. Slower laptops and phones will take longer. **Phones are not measured.** Single-thread phone CPUs are usually a few times slower than an M-series core, so expect about 20–40 s for a 20 s clip and minutes for a 60 s one. `tiny.en:q8` is the fallback if that proves too slow (twice as fast, slightly worse words). Firefox and Safari themselves are not measured either; only Chrome with WASM forced.
