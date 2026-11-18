# Building the goal plan

17 Nov 2026. How `docs/pricing-and-quality-plan.md` turns into code: what each piece is, the contract it is built to, where it lives, what it waits for. Status is kept in `PLAN.md`; decisions in `docs/adr/`.

The order follows one rule: pure, tested functions in `packages/core` first; wiring into Convex, the editor and the renderers second, one small PR each, because the editor files are busy.

| # | Piece | Contract | Status |
|---|---|---|---|
| 1 | Credits and plans | ADR 0014, `packages/core/src/credits.ts` | Pure model built. Server wiring waits for #37. |
| 2 | Taste heuristics | below | Cut rules and captions merged (#49). J/L cuts, emphasis punch-ins and -14 LUFS in a PR. |
| 3 | Three versions | below | Not started. |
| 4 | Quality check on every export | below | Not started. |
| 5 | First cut under 15 s, streamed | below | On-device flow measured at 14–21 s landing to export; the first-cut time is not measured on its own. |
| 6 | Eval harness and labels | below | Harness and pure labels in a PR. No editor references exist yet. |
| 7 | Generation labelled experimental | ADR 0014 §5 | Copy only; goes in with the b-roll action. |
| 8 | Always-warm edit lane | none | Not built. Conflicts with the spend cap; owner decision. |
| 9 | Hook scoring by a language model | none | Not built. Needs a key; see 2e. |

## 2 · Taste heuristics

All on word timings, in `packages/core/src/autocut.ts` and its Python twin, same tests on both sides. The rule above every other: polish how it was said, never what was said. A wrong cut is worse than a missed one.

- **a. Keep the last clean take.** A phrase restarted, or a sentence said again, keeps only the last attempt. A restart needs evidence (a pause, a filler, a cut-off word) so deliberate repetition stays.
- **b. Breath padding.** A cut keeps 140 ms after the last kept word and 80 ms before the next, never more than 45% of the gap. A filler and the pauses around it become one cut.
- **c. Captions.** Two lines at most, about 18 characters each at 9:16, broken at punctuation or a pause, no orphan words. `captionBand(aspect, faceCy)` gives where they may sit: clear of the platform's top 12% and bottom 22%, and off the face.
- **d. J and L cuts** (built). `toTimeline` returns `picture` and `sound` separately. The sound plays the kept ranges exactly, with a 30 ms click-free window at every cut (the outgoing piece fades over its last 15 ms, the incoming over its first 15 ms, inside the kept range, so no removed audio is heard). Only the picture cut moves, by 80 ms: where the next piece starts a sentence the sound leads (J), otherwise the picture leads (L). The lead is clamped to the clip, the removed gap and a third of either piece; duration and word timing are unchanged. Remotion and the browser render picture and sound as separate sequences. The sound is mixed sample-accurately outside Remotion (Remotion applies volume per frame): in PCM on the device, with ffmpeg on the worker from the job's `sound` plan.
- **e. Punch-ins on emphasis** (built). Each word carries `rms`, its loudness relative to the take's median word, optional in the contract. The device engine measures it from the audio Whisper hears, and the worker's transcribe from one 16 kHz decode. Above 0.5 the energy dial adds a small push (1.03–1.08×) on content words said clearly louder than the take and their neighbours: never fillers, short words or function words. The push holds 1.2 s and comes at most once every 8 s, or every 4 s at full energy, on the output timeline. Each one is an explained change ("punched in on 'never' · you leaned on it"), pins are respected, and without `rms` the dial behaves as before. Scoring three hook candidates with a language model stays behind a flag with "not configured" as its honest state; the heuristic fallback is the first bead.
- **f. Loudness** (built). Export at −14 LUFS with a −1 dBTP ceiling. `core/loudness.ts` has BS.1770-4 integrated loudness (K-weighting derived per sample rate, both gates) and a 4× true peak. The device measures the edit's mixed sound and applies one gain, capped by the ceiling. The worker runs a two-pass `loudnorm`, linear where possible. It also undoes afftdn's ~25 ms delay, which had put the sound behind the lips on every server export.

## 3 · Three versions

Picking beats editing. After the first cut the editor shows three previews side by side and applies the one picked.

- `packages/core/src/versions.ts`: `VERSIONS = ["clean", "punchy", "genre"]`; `versionChanges(doc, id): Change[]`. Each version is a preset over what already exists: the dials (`dialChanges`), the caption look and the genre recipe. Clean: pace 0.5, energy 0.5, captions clean. Punchy: pace 0.85, energy 0.9, captions bold. Genre: the recipe for `doc.genre`, or the most likely one from the transcript.
- Every change carries a one-line reason and the actor `autopilot:versions`; pinned items are never touched (the dial machinery already guarantees this). Picking is one undoable change.
- The three previews are the same media through the web renderer with three documents; nothing is rendered on a server.
- Not shown before the first edit exists (MVP spec: no choice of style before the first edit).

## 4 · Quality check on every export

No export is delivered broken. Two layers.

- **The document** (`packages/core/src/qc.ts`, pure): `qcDoc(doc): QcIssue[]` over `toTimeline(doc)`.
  - `mid_word_cut`: a cut boundary inside a kept word. Fixable: snap to the word edge.
  - `caption_collision`: a caption over two lines, two captions overlapping in time, or a caption outside `captionBand`.
  - `flash_segment`: a kept segment under 200 ms.
  - `empty`: nothing kept.
- **The file** (`qcMedia(stats): QcIssue[]`, pure over measured numbers):
  - `black_frames`: more than 0.5 s of frames under 2% mean luma.
  - `frozen_frames`: more than 1 s with no change between sampled frames, where the source moved.
  - `clipping`: true peak above −0.3 dBFS, or more than 0.1% of samples clipped.
  - The numbers come from the device renderer (sample one frame in ten on a small canvas; peak from the mixed audio) and from ffmpeg on the worker (`blackdetect`, `freezedetect`, `astats`).
- **The gate.** Fixable issues are fixed and re-checked once. Anything left blocks the download with a plain line naming the problem and a way out ("the audio clips at 0:12 · lower the music or export anyway"). "Export anyway" is allowed for the person's own footage problems (clipping in the source), never for ours (black or frozen frames). A blocked generation job reports `qc_failed` and its credits are refunded (ADR 0014).
- Each issue is `{ code, atMs, spanMs, fixable, ours }`.

## 5 · First cut under 15 s

Target: the first cut plays within 15 s of the drop starting.

- Measure first: a `first_cut` mark (drop start → first playable edit) next to the existing `first_preview`, in the device flow and the server flow, shown on `/funnel`.
- Then stream: transcribe in 30 s windows and cut each as it lands, so a 60 s clip shows its first half cut while the second is still being heard. `autocut` is already pure over a word list; the open part is stitching at window edges (re-cut the last sentence of a window when the next arrives).
- The always-warm lane in the goal plan is not needed for this on the free tier: the visitor's own device has no cold start.

## 6 · Eval harness and labels

- `packages/core/src/eval.ts` and `scripts/eval/run.ts`: score the automatic cut against a human editor's kept ranges (precision and recall over removed time, boundary error, mid-word cuts). `eval/golden/` holds the cases.
- The north star, a blind pairwise win rate of 50% or more against a human editor, is not measured. It needs about 200 raw clips with editor cuts, and raters.
- Labels: every restore, pin and caption edit by the person is a label (`labelsFromChange`). Storing them and tuning thresholds per person and globally comes after.

## What needs the owner

1. The free tier's shape and the Stripe prices (ADR 0014).
2. An always-warm edit lane for paid plans: it costs money every hour and the workspace is at its spend cap.
3. A language-model key for hook scoring.
4. About 200 raw clips with editor reference cuts, for the eval.
