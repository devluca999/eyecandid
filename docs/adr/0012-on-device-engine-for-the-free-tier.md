# 0012 · The free tier runs on the visitor's device

**Status:** accepted · 2026-11-17

**Context.** The MVP spec targets a free tier that costs almost nothing while Eyecandid finds its first users. The server pipeline (Modal workers, ADR 0003/0010) works, but the workspace hit its spend cap and the owner can't attach a card yet. Modern browsers can now run both halves of the core loop: Whisper with word timestamps on WebGPU (`@remotion/whisper-webgpu`, Transformers.js) and a WebCodecs render of a Remotion composition (`@remotion/web-renderer`, stable since 4.0.491).

Measured on a Mac (Chrome, Apple GPU, model cached), `/lab/local` and then the real flow:
- 9 s test clip: transcribe 1.6 s (`base.en`), render 2.7 s.
- 21 s portrait phone clip: transcribe 2.8 s, render 7.4 s; real landing → editor → export **21.3 s** end to end.
- First visit downloads the model once: `base.en` 206 MB (tiny 120 MB, small 586 MB).
- `base.en` passes the cut-quality gate (um struck, the "it it" stutter heard and struck, three beads); `small.en` smooths the stutter away.

**Decision.** Add a second engine; keep the first.
- At drop, if the `on_device` flag is on (default) and the browser passes `canUseWhisperWebGpu` and `canRenderMediaOnWeb`, the project is created with `engine: "device"`. The clip is **not uploaded**: its media row has `storage.provider = "device"`.
- The browser transcribes and sends the transcript to `projects.applyDeviceTranscript`, which validates it against the engine contract (`JOB_SPECS.transcribe.output`) and runs the **same** autocut (`packages/core/src/autocut.ts`, the TS twin of the Python handler with the same tests), `beadChanges` and `retakeChanges` server-side. The edit model, explanations, pins and undo are identical to the worker path.
- Export: `pipeline.authorizeDeviceExport` applies the same server-side plan as `startExport` (`planExport`: watermark, length cap, paywall), records the export and counts its minutes; the browser then renders the returned snapshot with `CutWeb` (the Cut composition using `@remotion/media` `<Video>`) and downloads it. The export gate (sign-up, paywall) wraps both engines.
- Otherwise (no WebGPU/WebCodecs, flag off) the worker path runs exactly as before. Pro and GPU features stay server-side.
- Tests pin the engine through `localStorage["eyelore.engine"]`; CI proves the worker path, the device path is proven locally in a real browser (`scripts/lab/`).

**Consequences.**
- Free edits cost no compute and no storage; the clip never leaves the device (a privacy point we can say plainly).
- The watermark and the length cap are decided by the server but applied by the visitor's browser; someone who edits their own browser can bypass them. Accepted for the free tier.
- The clip lives in one tab: reloading or opening the edit elsewhere can't play or export it, and the editor says so. "Your edits" still lists it (the edit doc is on the server).
- Devices without WebGPU fall back to the worker queue, which needs a running worker; without one they see the honest "engine is cold" line.
- Reframe on device: after the edit is ready, the browser samples the clip at ~4 fps (≤ 240 frames), runs MediaPipe BlazeFace (self-hosted under `/mediapipe`) and sends smoothed keyframes to `projects.applyDeviceReframe` (same smoothing as the server handler, `smoothFaceTrack`). 21 s clip: 86 frames, 9.5 s, in the background; it never blocks "ready" or export, and a failure keeps the clip centred.
- Phones are not yet measured; the model download (206 MB once) is the first-visit cost.

## Amendment · 19 Nov 2026 · the first-visit download has to survive a bad connection

**What broke (owner QA, Windows Chrome, AMD GPU).** A first visit froze at "43 of 206 MB" for minutes with no network activity, and a second try failed with "failed to execute 'put' on 'cache': cache.put() encountered a network error". `@remotion/whisper-webgpu`'s `downloadWhisperModel` fetches each model file once through Transformers.js `env.fetch` (`remotion.media/models/whisper-base.en_timestamped-v1/…`: `onnx/encoder_model.onnx` 82.5 MB and `onnx/decoder_model_merged_q4.onnx` 123.7 MB, plus small JSON) and pipes the body straight into `cache.put`. It has no timeout, so a quiet connection hangs forever, and no retry, so a dropped one errors `cache.put` and the raw message became the edit's failure line. Each try was a new project.

**Decision.** `lib/resilient-fetch.ts` replaces `env.fetch` (page and the WASM worker). The host, file list and cache keys stay the library's.
- **Stalls:** a stall is no byte for 15 s, including the wait for headers. The download retries 3 times (backoff 1, 3, 8 s), and any byte that arrives resets the count.
- **Resume:** it resumes with `Range: bytes=<got>-`. Both hosts answer 206 and expose `Content-Range`, which must start at the right byte with the same total. A 200 or a wrong 206 reads the file again and skips what was already sent.
- **No short files:** the body closes only when every byte of the known length has arrived. `cache.put` with an erroring body stores nothing, so the cache never holds a short file, and `isWhisperModelCached` is checked afterwards.
- **Same edit:** after a final failure the edit shows one plain line (`failureLine`) and "try again", which runs the same edit (`projects.deviceRestart`). The bytes this tab already had are replayed, then fetched by Range.
- **Reload:** an edit reopened before it was ready offers "choose it again" (±1 s) and finishes the same edit. The Lens shows a plain frame, not the stand-in figure.
- **While waiting:** the raw take plays muted during the download.
- **Measured** (Mac, real GPU, fresh profile, `scripts/lab/download-stall.mjs`): an injected stall at 40 MB is detected after 15 s and the edit is ready 59 s after the drop (49 s download, 8 s listening; DEV Convex). In a later run the resume is a real `Range: bytes=40046137-` request. A stall at 100 MB into the decoder, then offline: the retries go "slow connection (1 of 3)", "you're offline (2, 3 of 3)". Chrome then raises the owner's exact "Cache.put() encountered a network error", and the page shows "you went offline while the editor downloaded · try again when you're back". Try again replays the 100 MB already held and fetches the rest with `bytes=100011244-`, which takes 4.4 s. The same edit is ready at 64.6 s, and both cached files' bodies are exactly 82,451,730 and 123,736,279 bytes. Offline before the decoder starts: try again keeps the cached encoder, and the same edit is ready at 78.5 s. A reload mid-download, then choose it again, is ready 58 s later. On the WASM path, an injected stall at 20 MB is ready at 34.7 s.

**A smaller model was measured and not adopted.** The same `onnx-community/whisper-base.en_timestamped` was run in other dtypes through Transformers.js `pipeline` on WebGPU (M1, Chrome, `shader-f16` present), on three clips: TTS with "um / it, it / uh", the 21 s ring clip and a 64 s clip. Results are word timings and the server autocut against today's build (`scripts/lab/compare-asr.ts`).

| encoder + decoder | download | 21 s clip: words, \|Δ\| start/end, cut | 64 s clip: words, \|Δ\|, cut | warm listen 21 s / 64 s |
|---|---|---|---|---|
| fp32 + q4 (today) | 206 MB | reference | reference (17 beads, 2 pauses) | 3.2 s / 12.6 s |
| fp16 + q4f16 | 110 MB | 64/64, 1/1 ms, same | 188/190, 2/3 ms, differs (19 beads, 3 pauses) | 3.1 s / 11.7 s |
| q4 + q4f16 | 87 MB | 63/64, 4/6 ms, same | 182/190, 29/29 ms, differs (20 beads, 1 pause) | 3.0 s / 12.1 s |
| fp16 + q8 | 95 MB | 63/64, same | 187/190, differs | 6.7 s / 26.9 s |
| q8 + q8 (the WASM build) | 77 MB | 63/64, differs | 185/190, differs | 12.1 s / 45.4 s |
| fp16 + fp16 | 146 MB | 63/64, same | 186/190, differs | 2.8 s / 11.2 s |

"Differs" means different from today's output, not worse: the repo's own gate clip (the 9 s um / "it it" take) wasn't available, so the cut-quality gate was not run as defined, and on the TTS stand-in today's build itself strikes neither "um" nor "it, it". On what was measured, the only builds at least 2× smaller (q4 + q4f16, q8 + q8) move words and the cut on the longer clip (q4 + q4f16: 29 ms mean shift, 182/190 words), and q8 is 2–4× slower on WebGPU. Every fp16 build needs the `shader-f16` GPU feature, which was not checked on the owner's Windows AMD machine. Using any of them also means calling `pipeline` ourselves instead of `@remotion/whisper-webgpu`, which fixes fp32 + q4 and its own host. Each build was run once, on one Mac. So base.en fp32 + q4 stays. The download is now resumable, and the size is a once-per-device cost. Side finding: today's q4 decoder writes the TTS "um" as "Uhm", which the filler list doesn't strike; the q8/fp16 decoders write "Umm"/"Uhh" and get struck. That is a filler-list question, not a model one.
