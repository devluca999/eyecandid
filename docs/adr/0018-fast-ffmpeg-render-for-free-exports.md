# 0018 · Free exports on the worker render with plain ffmpeg; Remotion stays for Pro

**Status:** accepted · 2026-11-19

**Context.** Free edits render on the visitor's device when the browser can (ADR 0012, 0016). Browsers that can't (rarer since the WebAssembly transcriber, ADR 0016/0017) fall back to the CPU worker, where the Remotion render (headless Chrome screenshotting every frame) took about 65 s for 7 s of video. The MVP spec's Phase 3 target is a 60 s clip in under 15 s on the CPU worker. A free export draws only what ffmpeg can draw: the kept ranges with J/L picture offsets, a face-following crop with punch-ins, captions and a watermark. Pro adds generated b-roll stills, which stay with the composition.

**Decision.**
- `fastPlan(doc, aspect)` in `packages/core` turns the edit into a picture plan. The plan holds shots (source frame ranges on the 30 fps grid, each with a fixed-size crop box whose corner follows the reframe track; a punch-in step starts a new shot) and captions on output frames. It holds the caption anchor and the frame count too. It calls the same `toTimeline`, `framesOf`, `faceAt`, `coverBox` and `punchAt` that `Cut.tsx` calls. A test checks every output frame against `Cut`'s own `shotBox`: same source frame, box within half a pixel.
- `startExport` sends `engine: "fast"` and the plan when the export is free and the doc has no b-roll overlays. Otherwise it sends neither, and Remotion renders as before.
- The worker (`handlers/fast_render.py`) only translates the plan into one ffmpeg command:
  - One decoder per forward run of shots (`fps=30`, `split`, then a `trim` per shot on half-frame edges, so nothing is buffered).
  - Per shot, `scale` to the crop box, then `crop` the frame out of it with piecewise-linear x/y in the frame number. The corner lands within half an output pixel of `Cut`'s. A box much larger than the frame (a landscape take in 9:16) is cropped first, then scaled, to save work. Then `concat`.
  - `subtitles` (libass) burns the captions and the watermark. libx264 encodes (ultrafast, CRF 23; `EYELORE_FAST_PRESET` picks superfast or veryfast).
  - The QC's black and freeze detectors run on a `split` of the encoded frames, so the file's picture is never decoded twice. After the render, the QC reads only the sound.
  - While the picture encodes, a second thread mixes the #57 sound plan and runs both loudnorm passes (−14 LUFS, −1 dBTP) to AAC. The last step is a stream copy with faststart.
- Captions use Geist, in the image under `eyelore_engine/fonts` (SIL OFL 1.1, licence alongside). Lines break the way the browser breaks them (greedy, from Geist Bold advance widths, inside the 6% margins). Each line sits on the baseline that CSS 22/26 gives it, so libass's own line height and box don't move them.
- Backwards compatible: both fields are optional. An older worker ignores them and renders with Remotion. A worker whose ffmpeg lacks libass or libx264 does the same.

**Consequences.**
- A free worker render is one ffmpeg pass plus a sound pass beside it. On a 4-vCPU x86 runner, a 62 s 1080x1920 export took 13.0 s from job start to checked file with ffmpeg 8.0, and 15.8 s with Ubuntu 24.04's ffmpeg 6.1, the one in the engine image (`services/engine/scripts/bench_fast_render.py`). Remotion took about 65 s for 7 s. The Modal worker is not measured yet.
- Two renderers draw the same plan. Anything new on screen for free exports goes into `fastPlan` and both renderers, as ADR 0015 did for sound.
- The server Remotion render has no Geist (it falls back to the system sans), so the fast render's captions now match the editor's typeface better than the Remotion export did.
- Captions in scripts outside Latin get an average advance width for line breaking. Their breaks can differ from the browser's.
