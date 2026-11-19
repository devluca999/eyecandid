# Grading rubric: does Eyecandid deliver its promise?

Frozen 18 Nov 2026. The grader scores against this file and nothing else. Changing a gate needs the owner's (Luca's) yes, written here with a date.

**The promise** (`docs/mvp-spec.md`): a stranger drops a raw, awkward phone take and, in about a minute, gets back a clean, captioned, well-paced edit they would actually post, without changing what they said.

**Pass** = every gate marked **code** passes, each with evidence (a file, a frame, a number, a command and its output). Gates marked **owner** need an account, a key, money or a decision only Luca can give. They are reported, never failed, and never count toward the pass. At most 4 grading rounds. After that, what is still failing goes to the owner as a decision.

**Grader rules:** read-only (no code edits, no merges, no submitted forms on production). Every verdict carries evidence. A refusal from a documented cap (`convex/lib/limits.ts`, the free export count) is the product working, not a failure. Test runs go to the dev deployment (local build), and production gets only the UX walkthrough. Say so if the walkthrough adds rows to the production funnel.

## A. The edit itself (the value). Raw test set: `scratchpad/raw-clips/` (MANIFEST.md)

Each clip goes through the real flow (`scripts/lab/device-flow.mjs`). Outputs are measured with ffmpeg/ffprobe and checked against a reference transcript from a larger model, corrected by hand where it's obviously wrong.

| # | Gate | Bar | Type |
|---|---|---|---|
| A1 | **Postable** | for at least 80% of clips, a critical creator would post the default edit as it is or after one small fix. Give the reason for each clip | code |
| A2 | Caption accuracy | word error rate ≤ 5% against the reference. No wrong word in the first 3 s (the hook). A name or slang the reference also misses doesn't count | code |
| A3 | Dead air | no silence > 0.7 s inside the output (`silencedetect=n=-35dB:d=0.7`) | code |
| A4 | Fillers and meaning | at least 80% of audible um/uh/false starts are gone. No content word is removed, and no word is clipped at a cut (re-transcribe the output and compare) | code |
| A5 | Loudness | integrated −14 ± 1 LUFS. True peak ≤ −1 dBTP (`ebur128=peak=true`) | code |
| A6 | Framing | in 9:16, the speaker's face is in frame in ≥ 95% of sampled frames, with no jump bigger than a smooth pan between neighbouring frames | code |
| A7 | Hook | the output starts on speech: < 0.3 s of silence before the first word | code |
| A8 | Captions read well | ≤ 2 lines, inside the safe area (no overlap with platform UI zones: top 12%, bottom 20%), legible on a phone, in sync (±150 ms) | code |
| A9 | File | 1080×1920 H.264/AAC, length matches the edit. Watermark on Free, none on Pro | code |

## B. Speed (the "about a minute")

| # | Gate | Bar | Type |
|---|---|---|---|
| B1 | Drop → first preview, model cached | p50 ≤ 30 s over the test set | code |
| B2 | Drop → first preview, first-ever visit | measured and reported (model download included). Pass if ≤ 60 s on a 50 Mbps line, or if the stage line says honestly what is happening and how long it will take | code |
| B3 | Drop → export | p50 ≤ 90 s | code |
| B4 | Same, on production with a cold worker | as spec Phase 2 | owner (no worker runs) |

## C. Reach (who it works for)

| # | Gate | Bar | Type |
|---|---|---|---|
| C1 | A browser without WebGPU (Firefox, older Safari, or a forced `eyelore.engine`) gets a finished edit, not an endless wait | an edit and an export at roughly the A bars | code (owner asked for a way that doesn't depend on WebGPU or Modal) |
| C2 | Phone width (375 px): drop, watch, export, share all usable | no horizontal scroll; targets ≥ 44 px | code |
| C3 | A real iPhone / Android run | | owner (needs the device) |

## D. Ease of use and the first minute (spec "The first minute", 1–8)

| # | Gate | Bar | Type |
|---|---|---|---|
| D1 | Nothing between the hero and a finished edit | no tour, no account, no email gate, no style choice before the first edit | code |
| D2 | Honest stage line throughout, with an estimate when slow | | code |
| D3 | The first preview autoplays; the raw take is one action away | | code |
| D4 | The summary says what changed ("4 fillers trimmed · 1 pause cut"), and each change has a one-line reason that can be undone | | code |
| D5 | Export in ≤ 2 actions from ready; download and share | | code |
| D6 | After the first export, Pro is offered, not pushed. A 2nd export asks for sign-in (or says honestly it isn't on yet) | | code; sign-in itself is owner (Clerk) |
| D7 | Errors and refusals are honest and say what to do next | | code |
| D8 | A11y: every control is named, keyboard works, contrast passes | | code |
| D9 | Design system: paper, glass, chrome; one accent for selection only; no sidebars, stat cards, gradient washes or emoji | | code |

## E. Running it (our success)

| # | Gate | Bar | Type |
|---|---|---|---|
| E1 | Funnel events for every step land in Convex (`landing_view` → `drop_started` → `first_preview` → `export_done`, share, access request) | checked on dev | code |
| E2 | Cost per free edit is known and ≈ $0 on the default path | | code |
| E3 | Caps and the daily budget flag refuse with the honest message | | code |
| E4 | Sentry, Clerk, Stripe, SendPulse live; Pro paid end to end | | owner |
| E5 | Domain eyecandid.co | | owner |
