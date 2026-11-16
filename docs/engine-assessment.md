# Media engine assessment — Nov 15, 2026

Source: everstock-media-engine.ipynb (Colab, L4), _engine/worker.py (v9/v10), shoplink_jobs_v2.py, make_cut.py, ShopLink finals + contact sheets on Drive.

## What the engine is today
- Colab L4 notebook boots ComfyUI, stages models to local SSD each session, then `worker.py` polls `MEDIA/jobs/*.json` on the Drive mount every 15 s and writes `status/*.json`, `outputs/`, `manifest.csv`.
- Models: LTX-2.5 22B distilled int8 (t2v/i2v/flf2v, joint audio+video), Gemma text encoder for LTX + Gemma-4 e2b (prompt enhancer, off by default), Qwen-Image-Edit-2511 + Lightning 4-step LoRA (identity stills), Z-Image-Turbo (t2i), Chatterbox TTS in its own venv, faster-whisper small (CPU) for word timing, Remotion for the cut, ffmpeg QC (freeze, silent audio, contact sheets).
- Brand logic lives in per-brand feeder scripts (shoplink_jobs_v2.py: hardcoded CHARS/PRODUCTS dicts, 4 stages: faces → scene stills → clip per beat → cut).
- Brand switching copies the engine scripts and string-replaces paths.
- The notebook embeds ~750 KB of base64 design-system files in one cell.

## Measured
- Cold start ≈ 10 min re-downloading ~70 GB of weights every session.
- Stills ≈ 27 s each. i2v clips ≈ 130–155 s each (first one 234 s). Fully serial.
- L4 = 1.71 CU/h → ~58 GPU-hours on the $10 Colab plan.

## What the outputs show
- Product drift: the ring turns into a dock-like object mid-clip; the case shape changes between beats.
- Spec conflict: prompts describe a round dusty-rose case; finals show a rectangular case.
- Low motion in b-roll: near-identical frames → slideshow feel.
- Hands appear in shots the prompt says are hands-free.
- LTX generates a new voice per clip, so a creator's voice won't match across beats.

## Priorities
1. Identity locks: product + creator LoRAs, real product photo as first/last frame for hero shots, one canonical product spec.
2. Automated QC gate: reference-similarity per sampled frame (product drift), motion score, hand/text artifact check via a VLM judge; 2 takes per beat, auto-pick.
3. Voice: one Chatterbox clone per creator, render full script audio once, drive lips from audio (InfiniteTalk / LongCat-Video-Avatar class) instead of per-clip LTX audio; A/B against LTX.
4. Harness: engine in git, one generic engine + project config, queue in the app backend (Convex) instead of Drive polling, lazy parallel model staging.
