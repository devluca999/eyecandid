# Eyecandid · pricing and "undeniably good" plan (the goal, 17 Nov 2026)

Saved verbatim from Luca on 17 Nov 2026 as the product goal. Where it differs from `docs/mvp-spec.md`, this plan is the
newer intent; the differences that need a decision are listed at the end.

## Cost model (estimates from the measured engine numbers + Modal rates)
Two lanes with very different costs:
- Edit lane (transcribe, auto-cut, reframe, captions, loudness, render): ~$0.02–0.05 per finished 60s edit. Whisper turbo ~10 s of L4 time, face tracking + LLM hook pass + CPU Remotion render + storage. Near-zero marginal cost.
- Generation lane (LTX i2v, stills, TTS, lip-sync, Sets): measured ~140 s per i2v clip on L4. Modal L4 ≈ $0.80/h, H100 ≈ $3.95/h → ~$0.03 per clip, ~$0.07 per beat with 2 takes + QC. Budget ~$0.02–0.03 per generated second all-in (cold starts, failed takes).
- Cold start is the real cost risk: 70 GB of weights per session. Bake weights into Modal volumes / memory snapshots, load per lane only.

Conclusion: don't meter editing; meter generation.

## Plans
| Plan | Price | What's in it | Worst-case cost |
|---|---|---|---|
| Free | $0 | Unlimited previews, 3 exports/mo, 720p, watermark, 10 one-time credits | < $0.50 |
| Creator | $19/mo ($180/yr) | Unlimited exports (fair use ~10 h raw/mo), 1080p, no watermark, all autopilots, genre switcher, 100 credits | ~$7 |
| Pro | $49/mo ($468/yr) | 4K, take mixer, fix-a-word/voice clone, brand kit, saved styles, priority lane, 500 credits | ~$20 |
| Studio | $149/mo | Multiple brands/projects, 3 seats, batch + API, 2,500 credits | ~$80 |
| Top-up | $10 = 120 credits | Never expire for 12 months | ~$3.60 |

Credit = 1 generated second (720p). Lip-synced talking head = 2 credits/s. Background replace / Sets = 1 credit/s. Reserve credits at job start, refund automatically if the QC gate fails.

Reference points (Nov 2026): Captions Max $24.99 / Frontier $69.99; Submagic Starter $19 (~15 videos), Pro $39; Descript Creator $35 monthly / $24 annual. Wedge: "unlimited edits" at $19 because edits cost us cents.

Beta (request access, first 100): Founding plan $19/mo locked for life with Pro credits, or $149/yr. Charge from day one.
Mobile: Apple IAP takes 15% (small business). Prefer web checkout link where allowed; otherwise price iOS ~20% higher.

## Making "instant professional edits" undeniable
1. Preview without a GPU. The edit is a JSON document; render previews in the browser (WebCodecs/Remotion player on the proxy). Server render only at export. Target: first cut on screen < 15 s after upload starts.
2. Stream the pipeline: transcribe chunks while uploading; cut/caption decisions arrive progressively.
3. Split lanes: an always-warm small edit lane (L4/CPU) that generation jobs can never block; generation on a batch H100 queue.
4. Taste is heuristics, not models: cut on word boundaries with breath padding, J/L audio cuts, kill flubbed repeats (keep the last clean take), punch-ins on prosodic emphasis, LLM scores 3 hook candidates, platform pacing targets, captions max 2 lines kept out of face + platform UI safe zones, -14 LUFS.
5. Show 3 versions, not 1: e.g. Clean / Punchy / Genre pick, side by side. Picking beats editing.
6. QC gate on every export: black/frozen frames, clipping, caption collisions, mid-word cuts. Never ship a broken export.
7. Measure "professional": golden set of ~200 raw clips with human-editor reference cuts; blind pairwise preference vs a human editor and vs Captions/Submagic. North star: win rate ≥ 50% vs human editor.
8. Flywheel: every restored bead, pinned window and caption edit is a label. Tune thresholds per user and globally.
9. Narrow the wedge: talking-head vertical 15–90 s (creators + UGC ads) first. Generation stays labelled experimental until identity locks + QC gate from the engine assessment are in.

## Where this differs from what's built or decided (for Luca)
- **Free tier:** the MVP spec says free edits run on CPU with one watermarked export; this plan says 3 exports/mo, 720p, 10 one-time credits. The free edit now runs on the visitor's device (ADR 0012), which makes "unlimited previews" cost nothing.
- **Plans:** the code has free / creator / studio, and Pro is sold as the `creator` Stripe price (PR #24). This plan has Creator $19, Pro $49, Studio $149, top-ups and a Founding beta plan. New Stripe prices need Luca (Stripe isn't connected yet).
- **Always-warm edit lane:** conflicts with the standing rule "never redeploy an always-warm worker" (the spend cap). The on-device engine gives the free lane instant start without one; a warm lane for Pro is a cost decision.
- **Credits:** PR #24 charges placeholder credits per GPU job; this plan defines 1 credit = 1 generated second (2/s lip-sync), reserved at start, refunded on QC failure.
- **LLM hook pass:** needs an LLM key (none yet).
