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
- **Default build, by clip length.** A clip of 30 s or less fits one Whisper window and gets `onnx-community/whisper-base.en_timestamped` q8 (80 MB, once per device). Its words were the closest to WebGPU base.en. A longer clip needs two or three windows. base.en took 29 to 42 s cached on those, so it gets `whisper-tiny.en_timestamped` q8 instead (44 MB): about twice as fast, with a few more slips. Someone who drops both lengths downloads both builds (124 MB in all).
- Hooks: localStorage `eyelore.engine = "wasm"` forces the CPU transcriber. `eyelore.wasm-model` picks one measured build regardless of length (`base.en:q8`, `base.en:q4`, `tiny.en:q8`, `tiny.en:q4`). `eyelore.lab = "1"` adds the words to the `[asr]` console line, which otherwise carries numbers only. `scripts/lab/device-flow.mjs` sets these from `LAB_ENGINE` and `LAB_WASM_MODEL` (it always sets lab). `LAB_NO_WEBGPU=1` hides `navigator.gpu`, which proves the automatic fallback.

**Measured** (Chrome for Testing via Playwright on an M1 Mac, 8 cores, 16 GB). The CPU transcriber was forced by the hook unless marked "auto". `crossOriginIsolated` was false, so ONNX Runtime ran on 1 thread. The Mac was shared with other sessions, with a load average between 80 and 210, so treat every number as an upper bound with wide spread. Download is the total the stage line showed. A cached run reuses the first run's profile.

| build | download | 21 s clip, first visit / cached | 49–59 s clips, cached |
| --- | --- | --- | --- |
| base.en q8 | 80 MB | 18.5 s / 8.3 s (auto, no WebGPU: 14.1 s and 24.1 s first visit, under heavy load) | 55 s: 29.3 s · 59 s: 36.4, 39.6, 28.9 s · 49 s: 42.1, 39.7 s |
| base.en q4 | 145 MB | 25.4 s / 12.0 s | 55 s: 40.1 s |
| tiny.en q8 | 44 MB | 10.8 s / 5.7 s | 55 s: 17.1 s · 59 s: 23.3, 20.9, 33.3 s (auto, first visit: 30.0 s) |
| tiny.en q4 | 99 MB | 16.4 s / 6.1 s | not run |
| WebGPU base.en (today) | 206 MB | 26.8 s / 6.5 s | 55 s: 17.4 s |

The clip says "Don't let a gym bro see this … smart watch". The WebGPU reference itself hears "Do not let a Jimbo see this" and "smart witch", and every CPU build repeats "smart witch". Compared with the WebGPU words on the 21 s clip:
- **base.en q8:** "recover" for "recovered" (1 of 64 words).
- **base.en q4:** "Jim bro" (2 of 64).
- **tiny.en q8:** "gym bro", which is right, but also "If you're a watch, keeps hitting" (4 of 64).
- **tiny.en q4:** "Jim bro" (2 of 64).

On the 55 s clip, base.en q8 differs in 3 of 162 words, tiny.en q8 in 5 and base.en q4 in 11. q4 is not smaller than q8 for these models: the q4 decoder is 124 MB against 54 MB.

**Consequences.**
- Free edits work without WebGPU and without any server, as long as the browser has WebCodecs for the render. A browser without WebCodecs still gets the honest refusal or the server path.
- Model files come from huggingface.co (the WebGPU build comes from remotion.media). There is no account, key or cost. The site has no CSP that would block it.
- Without COOP/COEP headers the page isn't cross-origin isolated, so ONNX Runtime runs single-threaded. Isolating the site could make this faster, but it touches every third-party embed, so it's left for its own decision.
- On this loaded M1, short clips are ready in 6–25 s and 50–60 s clips in about 17–33 s, so the 30 s bar holds for short clips and is borderline for the longest. Slower laptops will take longer. **Phones are not measured.** A single phone core is usually a few times slower than an M1 core, so expect roughly 20–40 s for a 20 s clip and a minute or more for a 60 s one.
- **Firefox and Safari are not measured.** Only Chrome was run, with the CPU path forced or with `navigator.gpu` hidden. Safari needs WebAssembly SIMD (16.4+). Both need the render check to pass, which means WebCodecs H.264 encoding.
