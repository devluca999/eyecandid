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
