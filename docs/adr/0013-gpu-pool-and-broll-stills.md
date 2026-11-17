# 0013 · A scale-to-zero GPU pool, and generated b-roll stills as its first job

**Status.** Accepted, 2026-11-17. Built, **not deployed** (the Modal workspace is at its spend cap; the owner approves any deploy). Extends ADR 0009 (Phase 4 addendum: the GPU gate and credits) and ADR 0010 (scale to zero).

**Context.** Phase 4 of the MVP spec needs "a GPU worker pool on Modal, scale to zero; first GPU job type: generated b-roll stills for a bead; job refused server-side without credits". The contract already had `still` (input `{prompt, refMediaIds, w, h, seed}`, output a `MediaRef`). The CPU pool (transcribe, autocut, reframe, render) must stay exactly as it is and must never pick up GPU work. Rules: the model runs on our own worker (no hosted image APIs), the licence must allow commercial use, and the GPU must cost nothing while nobody asks for a still.

## Decision

**Model: [Tongyi-MAI/Z-Image-Turbo](https://huggingface.co/Tongyi-MAI/Z-Image-Turbo)**, loaded through diffusers `ZImagePipeline` (pinned `diffusers==0.36.0`, the first release that exports it, checked in the wheel), bf16, 9 scheduler steps (8 forward passes), guidance 0 as its model card says.
- *Licence:* the model card's licence tag is **Apache-2.0**, checked 2026-11-17. The repository has no separate LICENSE file; the tag covers the whole repo, including the text encoder, VAE and tokenizer. Its text encoder is derived from Qwen3-4B, whose own card is also tagged Apache-2.0. Commercial use is allowed. Apache-2.0 asks us to keep the notice, which is in `docs/credits.md`.
- *Fit:* 6B parameters. In bf16 that is about 12 GB for the transformer and about 8 GB for the text encoder, which fits one 24 GB L4 with no CPU offload. `EYELORE_STILL_OFFLOAD=1` turns offload on if real runs show it doesn't fit.
- *Access:* ungated, so there is no Hugging Face token or click-through for the owner. The repo is 32.9 GB, downloaded once into the `eyelore-gpu-weights` Modal volume.
- `docs/engine-assessment.md` shows the legacy Colab engine already used Z-Image-Turbo for t2i.
- *Runner-up:* **FLUX.1-schnell** (Apache-2.0, 4 steps). Rejected for now: it is **gated** on Hugging Face (an HF token in the worker secret, plus the owner accepting the terms), and at 12B it needs CPU offload on a 24 GB card.
- *Not used:* SDXL-Turbo, whose licence does not allow commercial use.

**Handler** (`services/engine/eyelore_engine/handlers/still.py`):
- The pipeline loads lazily, once per container, behind a lock.
- The output is a PNG uploaded through the existing worker path (`/worker/upload-url` → `register-media`, kind `generated`).
- `w`/`h` are used as given. Sizes the model can't render (not multiples of 16, outside 256–2048, over 2 MP) and non-empty `refMediaIds` fail **without retry** (`NonRetryable`), rather than being silently changed.
- With no seed given, a stable seed comes from the prompt and size, so a retry makes the same picture.
- The model call is injected in tests. CI proves the plumbing only; **real generation is untested until a GPU worker runs**. There is no fallback image anywhere.

**Two pools, enforced on the server.**
- A worker whose registered provider ends in `-gpu` (`modal-gpu`) claims only GPU job types; every other worker claims only the free CPU types.
- `jobs.claim` enforces this from the worker row (`poolClaims` in `packages/core/src/plans.ts`), whatever types the worker asks for. The Python worker applies the same rule (`providers.claimable`), and a test keeps its CPU list in step with `FREE_CPU_JOB_TYPES`.
- `workerPresence` keeps its top-level fields for the CPU pool (the free loop's "engine is waking up" line is unchanged) and adds a `gpu` block.

**The GPU app** (`services/engine/deploy/modal_gpu_app.py`, app `eyelore-gpu` / `eyelore-gpu-prod`, secret `eyelore-gpu[-prod]`):
- Own worker token, slim image (no Node, Remotion or ffmpeg), `gpu="L4"` (`EYELORE_GPU` to change it), `min_containers=0`, `max_containers=1`.
- 15-minute hard cap per container (timeout 17 minutes), and it exits after 60 idle seconds.
- Woken by the same mechanism as the CPU app. Convex keeps per-pool wake state: `EYELORE_GPU_WAKE_URL`, its own debounce fields on `engineState`, and keys only for `modal-gpu` workers. A busy CPU worker therefore never stops a GPU wake, and a GPU job never wakes the CPU host.
- *Deviation from ADR 0010:* no hourly safety-net run, and no self-respawn at the time cap. An idle GPU start every hour would cost more than the stills. Convex's minute cron (`wake.check`) re-sends the wake for any GPU job still waiting, so a lost wake costs at most a minute.

**The product path** (`convex/broll.ts`):
- `broll.requestStill({ anonId, projectId, beadId, prompt?, requestId })` builds the prompt from the bead's kept words with a fixed template (`stillPrompt` in core; no LLM) and sizes the still to the doc's aspect (about 1 MP, multiples of 16).
- It enqueues through `enqueueJob`, so the ADR 0009 gate and the credit charge apply unchanged.
- Before charging, it refuses: a cut bead, a second still for a bead that already has one in flight, and a deployment with no `modal-gpu` worker registered ("the gpu isn't set up yet · nothing was charged"), since that job would queue forever. The Pro check runs first, so a free account hears about Pro rather than about our GPU.
- On success (`onStillDone`), the media row joins the project (listed with the edit, deleted with it), and an `autopilot:broll` change inserts or replaces the bead's slot `broll.<beadId>` on `/tracks/broll`. The reason is "b-roll · generated still for '<first words>'". A pinned slot or a pinned b-roll track is left alone: the still is kept and the editor says so.
- Removing it is a user change ("remove b-roll"), and ⌘Z puts it back.
- A failure never fails the edit. The credit is refunded once by the existing `refundJobCredits` path.

**Rendering.**
- The still's span is never stored. `brollOverlays(doc)` in core derives it from the bead's kept segments (`Segment.beadId`), so striking a word moves it.
- The Lens preview, Remotion `Cut` and browser `CutWeb` all show it cover-cropped, with a slow Ken Burns push from 1.00 to 1.08 and a 120 ms fade at each end (`kenBurnsAt`).
- `render.py` adds the stills' signed URLs to the Remotion media map. `authorizeDeviceExport` returns them for the browser renderer.

**Editor.**
- On a selected bead, "add b-roll" is a quiet pill shown only when `broll.state` (server-side, `gpuStanding`) says the caller is approved Pro with a live subscription.
- With no credits left the pill still shows, and the request returns the server's one-line refusal, shown verbatim.
- Everyone else sees nothing new; the free path and its snapshots are unchanged.
- The job state line follows the cold-engine line: "the gpu is asleep · waking it" only when a wake was really asked, "no gpu is running right now…" when nothing can be woken, "the gpu isn't answering…" when waking fails, "generating a still · on the gpu", or "still failed · … · your credit is back".

## Costs (estimates; verify before deploying)

Modal's [pricing page](https://modal.com/pricing), read 2026-11-17:

| item | price per second |
|---|---|
| L4 | $0.000222 |
| A10 | $0.000306 |
| L40S | $0.000542 |
| CPU | $0.0000131 per core |
| memory | $0.00000222 per GiB |

The GPU container (L4, 2 cores, 32 GiB) costs about **$0.000320/s**, or about $1.15 an hour while it runs.

| case | estimate |
|---|---|
| Warm still: ~1 MP, 8 forward passes, assumed 6–12 s on an L4, plus upload | **≈ $0.002–0.004** per still |
| Cold start: container start, then loading ~20 GB of bf16 weights from the volume, assumed 60–120 s (unmeasured) | ≈ $0.02–0.04 |
| Idle window before exit (60 s) | ≈ $0.02 |
| First-ever download of 32.9 GB into the volume | a few minutes, once |
| **A lone still after a quiet spell** | **≈ $0.04–0.07** |
| A batch of stills in one wake | approaches the warm cost |
| Ceiling per container (15-minute cap) | ≈ $0.29 |
| Idle | $0: nothing runs |

Against a placeholder 1 credit per still and 50 credits a month on Pro (`plans.ts`), the worst case is about $3.50 a month per Pro seat if every still is a cold start.

## Consequences

- No GPU spend at all until the owner deploys. Then spend follows requests, capped at one container.
- A Pro user's first still after a quiet spell waits for a cold start (unmeasured; likely 1–3 minutes including the weight load). The editor says what is happening instead of spinning.
- Real image quality, VRAM headroom on an L4 and timings are unproven until the first GPU run. Measure them and update this ADR.
- New job types (i2v, voice, …) only need a handler and the `modal-gpu` provider's capability list. The pool, gate, credits, wake and refunds are shared.
