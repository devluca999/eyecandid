# Eyecandid MVP spec

Nov 16, 2026 · @luca_m

## What we are shipping

Eyecandid (formerly Eyelore, domain eyecandid.co) is a video editor that turns a raw, candid phone take into a clean, captioned, well-paced edit in about a minute. The tagline stays **Making real people look great.** The value proposition is effortless content creation: even a candid shot can look cinematic.

The MVP is the smallest version that strangers can use for real, that you can measure, and that costs almost nothing to run while it finds its first 100 users:

- **Free, instant, no signup:** drop a clip, get a cut, captioned, reframed edit, export one watermarked video. Runs on CPU only.
- **Pro, by request:** people ask for access; you approve up to 100; approved users pay through Stripe and get no watermark, longer clips and GPU features (generated b-roll, genre looks) paid for with credits.
- **Web first.** The Expo app exists but waits for store submission and an in-app purchase decision.

**Success for the first month:** a stranger lands, drops a clip and exports in under 90 seconds, and the free tier costs under $50 a month to run.

## Where it stands (16 Nov 2026)

The core loop is built and has run against production in 56 seconds, but three account-level problems stop anyone using it today. Source: the repo's PLAN.md and HANDOFF.md (PR #12).

| Area | State | What it needs |
|---|---|---|
| Web app | Live at eyelore.vercel.app | Rebrand, new landing, custom domain |
| Core loop (drop, transcribe, cut, caption, reframe, export) | Built, tested end to end | A running worker |
| Engine workers (Modal, CPU) | Stopped: the Modal workspace hit its spend cap on 16 Nov | Raise the cap, merge PR #13 (scale to zero) |
| GitHub Actions (CI and deploy) | Blocked: jobs never start because of a failed payment or spending limit | Fix billing in GitHub settings |
| Open PRs | #7 accounts and paywall, #10 funnel dashboard, #12 handoff, #13 scale to zero, #14 mobile CI cost | Green CI, then merge |
| Clerk, Stripe, SendPulse, Sentry | Built behind flags as labelled stubs (PR #7) | Keys and flags |
| Mobile app | Core loop works in emulator CI | Out of MVP scope |

**Blockers only Luca can clear:** GitHub billing, the Modal spend cap, buying eyecandid.co, and creating the Clerk, Stripe, SendPulse and Sentry accounts.

## The first minute

A visitor becomes a user the moment they drop a clip; nothing stands between the hero and a finished edit. **Target: first preview playing within 30 s of the drop, export within 90 s.**

1. **Land.** The hero is the Claude Design v2 landing: tagline, scattered real clips, one drop zone. The drop zone is the real uploader, not a link to it.
2. **Start in one of three ways.** Drop or choose a clip (on a phone, the tap opens the camera roll or camera). Or tap *try it with our clip*: a 20 s awkward sample runs through the real pipeline, so people without a take still see the magic.
3. **Watch it happen in the Lens.** The editor opens on the local file instantly while it uploads. An honest stage line runs: uploading, listening, trimming the ums, captioning. If the engine is cold it says so with an estimate.
4. **See the before and after.** The first preview autoplays the edit with the raw take one drag away (the wipe from the hero). The summary line says what changed: "4 fillers trimmed · 1 pause cut".
5. **Leaving? Keep it.** If they switch tabs or leave mid-edit: "leave your email and we'll send it when it's ready". This becomes the SendPulse ready email.
6. **Export the first one free.** One tap, 9:16, captioned, watermarked, no account. Download plus the native share sheet.
7. **Ask for an account only when they want more.** Second export, removing the watermark, or saving the project → Clerk sign-in; the anonymous work carries over (already built in PR #7).
8. **Offer Pro, don't push it.** After the first export: "want no watermark, longer clips and generated b-roll? request access".

**Not in the first minute:** no onboarding tour on first visit, no pricing wall, no email gate before the result, no choice of style before the first edit (good defaults first, dials after).

## Access model

Free is open to everyone instantly and runs on CPU; Pro is request-access, capped at 100, and is the only tier that can wake a GPU. Prices are placeholders until you set them.

| | Free | Pro (request access) |
|---|---|---|
| How you get it | Open the site | Request access → approved by Luca → Stripe checkout |
| Account | None until the 2nd export | Clerk account |
| Clip length | 60 s | 5 min |
| Exports | 1 per anonymous session, 3 a month with an account | Unlimited |
| Watermark | Yes | No |
| Engine | CPU: transcribe, cut, captions, reframe, fast render | CPU plus GPU: generated b-roll, genre looks, select-and-talk |
| GPU credits | 0 | Monthly allowance, top-ups |
| Price | $0 | Placeholder: e.g. $19/mo with N credits |
| Raw files kept | 7 days | 30 days |

### How request access works

- The landing pricing section shows two cards: **Free** ("start now" → drop zone) and **Pro** ("request access" → email, what they make, a link to their work).
- Requests land in a Convex `accessRequests` table; an admin page lists them with approve and decline.
- Approve adds the email to the `pro` flag's allowlist (the flags table already has `allow[]`) and sends a SendPulse email with a Stripe Checkout link.
- The Stripe webhook sets the entitlement; GPU job types refuse to enqueue without one (server-side, never trusted from the client).
- A hard cap of 100 approved users is a config value; the admin page shows seats used.

## Low-cost architecture

Keep the architecture that exists and change only what burns money: nothing runs warm, free work never touches a GPU, and video files expire. The stack stays Vercel, Convex, Clerk, Stripe, SendPulse and Sentry, with workers pulling jobs from Convex.

### What changes

1. **Scale to zero (PR #13).** Convex calls the worker's wake URL when a job waits and no worker is polling; the worker drains the queue and exits after 3 idle minutes; an hourly run is the safety net. This replaces the 4-CPU container that ran around the clock and hit the Modal cap in hours.
2. **A fast free render.** Free exports render with plain ffmpeg (concat the kept ranges, burn ASS captions, loudnorm to −14 LUFS, scale and crop). Remotion stays for Pro looks. Today's CPU Remotion render takes about 65 s for 7 s of video; target under 15 s for a 60 s clip.
3. **Two worker pools.** `cpu` (Modal CPU, scale to zero) takes transcribe, autocut, reframe, render. `gpu` (Modal GPU function on the same image, scale to zero) takes generation job types and only for entitled users.
4. **Hard caps everywhere.** Upload limit 200 MB and 60 s for Free; one job per anonymous session at a time; a daily global budget flag that pauses Free with an honest message instead of running up a bill.
5. **Storage hygiene.** A Convex cron deletes raw uploads and proxies after 7 days (Free) or 30 days (Pro) and exports after 30 days, through `MediaStore.delete`.
6. **Warm-start tricks without warm machines.** Bake faster-whisper small and ffmpeg into the image; keep the model on a Modal volume; show the cold-start estimate in the Lens.

### Monthly fixed costs at 100 users (estimates, verify on each pricing page)

| Item | Plan | Why |
|---|---|---|
| Vercel | Pro (Hobby is non-commercial) | Needed once you charge |
| Convex | Free tier at first, Pro if storage or bandwidth runs out | Video files are the risk; expiry keeps them small |
| Modal | Pay per second, scale to zero, workspace spend cap set | Variable cost; the cap is the safety net |
| Clerk, Sentry, SendPulse | Free tiers | Comfortably under limits at 100 users |
| Domain | eyecandid.co | About $20 a year |

The number that matters is **compute cost per Free edit**. Measure it in Phase 3 from Modal billing divided by `export_done` events, and set the daily budget flag from it.

## Build phases for Claude Code

Five phases, each a small PR series with green CI; Phase 0 and 1 come from the separate launch prompt, the rest from this spec. Each phase is done only when its acceptance checks pass on production.

### Phase 0: unblock and ship what exists
- [ ] GitHub Actions run again (Luca fixes billing); open PRs #14, #13, #10, #7, #12 merged in that order with green CI
- [ ] PR #13 deployed: workers scale to zero; `EYELORE_WAKE_URL` set on both Convex deployments; cold start measured and written in HANDOFF
- [ ] **Accept:** a clip dropped on production after 30 idle minutes exports successfully, and Modal shows zero running containers 5 minutes later

### Phase 1: Eyecandid rebrand and the new landing (launch prompt)
- [ ] User-facing rename everywhere; eyecandid.co on Vercel; old URL redirects
- [ ] Landing ported from the Claude Design v2 page; the hero drop zone is the real uploader
- [ ] **Accept:** Lighthouse mobile performance ≥ 85, LCP < 2.5 s, landing → export works on production

### Phase 2: the first minute
- [ ] Sample clip button: a hosted 20 s sample creates a real project through the same pipeline (cached result allowed after the first run, labelled "sample")
- [ ] First preview streams: autocut and captions land before reframe and render; the Lens plays as soon as autocut completes
- [ ] Before/after wipe on the first preview
- [ ] Leave-your-email capture on tab hide or exit intent while a job runs → SendPulse ready email
- [ ] Clerk sign-in at the 2nd export with the anonymous project claimed (PR #7), flag `accounts` on
- [ ] **Accept:** Playwright drop → preview p50 ≤ 30 s and drop → export p50 ≤ 90 s on production with a cold worker; funnel events recorded for every step

### Phase 3: cost controls
- [ ] ffmpeg fast render for Free; Remotion only for Pro
- [ ] Free caps (60 s, 200 MB, 1 concurrent job per session), daily budget flag with an honest pause message
- [ ] Expiry cron for raw files, proxies and exports
- [ ] `/funnel` shows cost per Free edit (Modal spend ÷ `export_done`)
- [ ] **Accept:** 60 s clip renders in < 15 s on the CPU worker; a test with the budget flag off shows the pause message

### Phase 4: request access and Pro
- [ ] Pricing section with Free and Pro cards; request-access form → `accessRequests`
- [ ] Admin page (token-gated like `/funnel`): approve, decline, seats used of 100
- [ ] Approve → allowlist + SendPulse email with Stripe Checkout; webhook sets entitlements and credits (flag `billing`)
- [ ] GPU worker pool on Modal, scale to zero; first GPU job type: generated b-roll stills for a bead; job refused server-side without credits
- [ ] **Accept:** a test user requests, is approved, pays with a Stripe test card, removes the watermark and spends one credit on a generated b-roll; an unapproved user cannot enqueue a GPU job

### Phase 5: launch hygiene
- [ ] Sentry on web, Convex and worker; alert on job failure rate > 5% in an hour
- [ ] Terms, privacy (what we store, for how long, deletion), stock-footage credits page
- [ ] Rate limiting on uploads and requests per IP
- [ ] **Accept:** a forced worker error appears in Sentry within a minute

## Later: Studio Scan and other post-MVP

**Studio Scan** is a guided, tripod-and-timer capture that gives Eyecandid a reusable model of you, so generated scenes (walking a void corridor, standing on a giant piano) keep your real face, body and clothes without filming every scene. It is Pro-only and post-MVP.

### How it feels
1. An "advanced creation" mode asks for a tripod or a phone propped up, full body in frame, even light.
2. A voice-guided timer shoots a sequence while you turn: front, three-quarter left, side, back, three-quarter right, then a face close-up and a few expressions. About two minutes, with a live check that each pose is in frame and sharp.
3. It builds your Scan: a named identity you can drop into any generated shot, reused across projects.

### How to build it, in steps of rising cost
- **Step 1, reference pack** (cheapest, most value): the multi-angle stills plus a matte of you become conditioning for the image and video models, picking the right angle for each shot. This also fixes the identity drift the engine assessment found.
- **Step 2, personal LoRA:** a small fine-tune per user on the scan, trained once on GPU and stored per user. Much stronger likeness; costs a training job, so it spends credits.
- **Step 3, 3D avatar:** a gaussian-splat or mesh avatar for camera moves around you. Highest fidelity and cost; only if Steps 1 and 2 aren't enough.
- **Compositing your real footage:** matte yourself from a real take and place it on a generated plate with matched light, grain and camera motion; use the Scan only for angles you didn't film.

**Rules:** a Scan can only be made of the account holder, with a consent step; it is never used to train shared models; deleting it removes the stills, matte and any LoRA.

**Other post-MVP, in rough order:** the idea engine (needs an LLM key), Weave (auto b-roll cutaways), the genre switcher on real exports, select-and-talk, the mobile app in the stores, resumable uploads.

## Metrics, decisions, risks

Two numbers decide whether the MVP works: how many landers export, and what each Free export costs.

| Metric | Target | Source |
|---|---|---|
| Drop → first preview (p50) | ≤ 30 s | `drop_started` → `first_preview` |
| Drop → export (p50) | ≤ 90 s | `drop_started` → `export_done` |
| Landing → drop | ≥ 15% | `landing_view` → `drop_started` |
| Drop → export | ≥ 50% | funnel |
| Compute cost per Free export | Measure, then cap | Modal spend ÷ `export_done` |
| Pro requests in month 1 | 100 | `accessRequests` |

### Open decisions for Luca
- [ ] Pro price and monthly credit allowance (and what one credit buys)
- [ ] Free limits: 60 s clip and exports per month, as proposed?
- [ ] Founder letter text (the current placeholder is invented and must be replaced)
- [ ] Whether to buy eyecandid.online as a redirect
- [ ] Trademark and social handle check for "Eyecandid"

### Risks

| Risk | Mitigation |
|---|---|
| Cold start makes the first minute slow | Small image with models baked in, honest estimate in the Lens, sample clip result cached |
| Free abuse runs up compute | Caps per session and IP, daily budget flag, spend cap on Modal |
| Video storage grows | Expiry cron, export-only retention after 30 days |
| Stock footage licensing on the landing | Self-host clips, keep a credits page, confirm the Mixkit licence covers site backgrounds |
| Rename churn | User-facing rename now; internal package and infra names stay eyelore until an ADR says otherwise |
