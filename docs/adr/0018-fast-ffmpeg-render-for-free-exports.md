# 0018 · Free exports on the worker render with plain ffmpeg; Remotion stays for Pro

**Status:** accepted · 2026-11-19

**Context.** Free edits render on the visitor's device when the browser can (ADR 0012, 0016). Browsers that can't fall back to the CPU worker, where the Remotion render (headless Chrome screenshotting every frame) took about 65 s for 7 s of video. The MVP spec's Phase 3 target is a 60 s clip in under 15 s on the CPU worker. A free export draws only what ffmpeg can draw: the kept ranges with J/L picture offsets, a face-following crop with punch-ins, captions and a watermark. Pro adds generated b-roll stills, which stay with the composition.

**Decision.**
- `fastPlan(doc, aspect)` in `packages/core` turns the edit into a picture plan. The plan holds shots (source frame ranges on the 30 fps grid, each with a fixed-size crop box whose corner follows the reframe track; a punch-in step starts a new shot) and captions on output frames. It holds the caption anchor and the frame count too. It calls the same `toTimeline`, `framesOf`, `faceAt`, `coverBox` and `punchAt` that `Cut.tsx` calls. A test checks every output frame against `Cut`'s own `shotBox`: same source frame, box within half a pixel.
- `startExport` sends `engine: "fast"` and the plan when the export is free and the doc has no b-roll overlays. Otherwise it sends neither, and Remotion renders as before.
- The worker (`handlers/fast_render.py`) only translates the plan into one ffmpeg command:
  - One decoder per forward run of shots (`fps=30`, `split`, then a `trim` per shot on half-frame edges, so nothing is buffered).
  - Per shot, `crop` with piecewise-linear x/y in the frame number, then `scale` to the frame and `concat`.
  - `subtitles` (libass) burns the captions and the watermark. Then libx264 encodes the picture while the #57 sound plan mix and its loudnorm first pass run in parallel. The mux, the −14 LUFS second pass and the QC measure are the existing code.
- Captions use Geist, in the image under `eyelore_engine/fonts` (SIL OFL 1.1, licence alongside). Lines break the way the browser breaks them (greedy, from Geist Bold advance widths, inside the 6% margins). Each line sits on the baseline that CSS 22/26 gives it, so libass's own line height and box don't move them.
- Backwards compatible: both fields are optional. An older worker ignores them and renders with Remotion. A worker whose ffmpeg lacks libass or libx264 does the same.

**Consequences.**
- The free worker render is a single ffmpeg pass. The numbers are in the PR that introduced it.
- Two renderers draw the same plan. Anything new on screen for free exports goes into `fastPlan` and both renderers, as ADR 0015 did for sound.
- The server Remotion render has no Geist (it falls back to the system sans), so the fast render's captions now match the editor's typeface better than the Remotion export did.
- Captions in scripts outside Latin get an average advance width for line breaking. Their breaks can differ from the browser's.
