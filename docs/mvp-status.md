# MVP status against `docs/mvp-spec.md`

17 Nov 2026, read from `main` and the open PRs. **The MVP is not complete.** Most of the code exists; what is missing is either blocked on an account step only Luca can take, or one of the code gaps in the last section. Free edits run on the visitor's device (ADR 0012), which replaces several lines written for a CPU worker.

Status words: **done** (on `main`, with a test or a measured run), **PR** (open, number given), **partial**, **not built**, **owner** (needs a key, money or a decision), **replaced** (by ADR 0012).

## Phases

| Phase | Line | Status | Evidence, or what is missing |
|---|---|---|---|
| 0 | Actions run; #14, #13, #10, #7, #12 merged | done | all merged; repo public |
| 0 | #13 deployed, `EYELORE_WAKE_URL` set, cold start measured | owner | Modal workspace at its spend cap; no deploy allowed |
| 0 | Accept: clip exports after 30 idle minutes, zero containers 5 minutes later | owner | no worker in production. Free edits need none on a WebGPU browser |
| 1 | Rename; eyecandid.co; redirect | partial, owner | rename done (ADR 0011); domain not bought |
| 1 | Landing ported, hero drop zone is the real uploader | done | `apps/web/app/hero.tsx`; `e2e/landing.spec.ts` |
| 1 | Accept: Lighthouse mobile ≥ 85, LCP < 2.5 s, landing → export on production | partial | mobile 90 after #27, LCP about 3.6 s measured locally (missed). Landing → export proven locally only (14–21 s on a Mac) |
| 2 | Sample clip button | owner | built, hidden until `NEXT_PUBLIC_SAMPLE_CLIP_URL` is set; no sample clip supplied |
| 2 | First preview streams (cut and captions before reframe and render) | done | `convex/pipeline.ts` sets `ready` on autocut; device path `projects.applyDeviceTranscript`; `device.test.ts` |
| 2 | Before/after wipe | partial | an edit / raw switch, not a drag wipe; autoplay only in theater mode |
| 2 | Leave your email → ready email | done, owner | `ReadyEmail.tsx`, `readyEmail.test.ts`; sending needs SendPulse keys; fires on tab hide only; hidden on device edits |
| 2 | Clerk sign-in at the 2nd export, anonymous project claimed | partial, owner | claim built (`convex/account.ts`, `around.test.ts`); there is no export counter, so sign-in is asked at the 1st export; needs Clerk keys |
| 2 | Accept: p50 ≤ 30 s to preview, ≤ 90 s to export, on production, cold worker; every funnel step recorded | not built, owner | no p50 spec and no production run. Events missing: sample start, leave-email, access request, checkout, web `share` |
| 3 | ffmpeg fast render for Free | replaced, not built | free renders in the browser. The worker fallback (browsers without WebGPU) is still the slow Remotion render |
| 3 | Free caps; daily budget flag with a pause message | done | `convex/lib/limits.ts`, `caps.test.ts`. The pause line (`FreeStatus`) is not mounted on the landing |
| 3 | Expiry cron | done | `convex/expiry.ts`, `caps.test.ts` |
| 3 | `/funnel` cost per free edit | PR #31 | an estimate from worker seconds; device edits cost 0 |
| 3 | Accept: 60 s clip renders in < 15 s on the CPU worker | replaced | not measured on a worker. On device, landing → export is 14–21 s |
| 3 | Accept: budget flag off shows the pause message | done | `caps.test.ts` "free_paused flag refuses free edits with the pause message" |
| 4 | Pricing cards; request-access form | done | `_landing/pricing.tsx`, `convex/access.ts`, `e2e/landing.spec.ts` |
| 4 | Admin page: approve, decline, seats of 100 | done, owner | `admin/access`, `pro.test.ts`, `e2e/admin-access.spec.ts`; needs `EYELORE_ADMIN_TOKEN` in production |
| 4 | Approve → allow list + email with checkout; webhook sets plan and credits | done, owner | `pro.test.ts`; never run against Stripe (no keys) |
| 4 | GPU pool, scale to zero; b-roll stills; refused without credits | PR #37, owner | refusal and credits are on `main` (`chargeGpuJob`, `pro.test.ts`). Handler, GPU app and the editor action are in #37, not deployed |
| 4 | Accept: request, approve, pay with a test card, remove the watermark, spend a credit | owner | request, approve and refusal are tested; payment and a real generation have never run |
| 5 | Sentry on web, Convex, worker | done, owner | wired, a no-op without a DSN |
| 5 | Alert on job failure rate > 5% in an hour | not built | only failures are reported, so a rate cannot be computed; no alert rule |
| 5 | Terms, privacy, credits page | done | `/terms`, `/privacy`, `/credits` |
| 5 | Rate limiting per IP | PR #29, owner | limits and the signed hint are on `main`, but nothing sends the hint until #29; needs `EYELORE_HINT_SECRET` |
| 5 | Accept: a forced worker error reaches Sentry within a minute | owner | needs a DSN and a running worker |

## Access model

| Row | Status | Note |
|---|---|---|
| Free: open, no account | done | |
| Clip length 60 s / 5 min | done | `caps.test.ts`; the length is the client's probe |
| Exports: 1 per anonymous session, 3 a month with an account | not built | usage is counted in minutes (free: 10 a month), not exports |
| Watermark | done | on device the browser applies it (accepted in ADR 0012) |
| GPU only for Pro, paid with credits | done | `chargeGpuJob`; costs are placeholders until ADR 0014 is wired |
| Raw kept 7 / 30 days | done | `convex/expiry.ts` |
| Price | owner | placeholder; proposal in `docs/pricing-and-quality-plan.md` |

## Code gaps that need no key and no money

In order of what they unblock:

1. Free export count (1 anonymous, 3 a month with an account), sign-in asked at the 2nd export, and "request access" offered after the 1st. Part of the ADR 0014 rollout.
2. Mount the free pause line on the landing; merge #29 so per-IP limits are real.
3. Funnel coverage: sample start, leave-email, access request, checkout, web share; a p50 check for preview and export.
4. Before/after as a drag wipe, autoplaying the first preview.
5. Job success counts to Sentry, so a failure rate exists to alert on.
6. ffmpeg fast render on the worker, for free visitors without WebGPU. Only matters once a worker runs.

## Needs Luca

1. Raise the Modal spend cap, then approve the worker deploys (CPU, and the GPU app in #37).
2. Keys: Clerk, Stripe (test mode first), SendPulse, Sentry.
3. Production Convex env: `EYELORE_ADMIN_TOKEN`, `EYELORE_HINT_SECRET` (the second also in Vercel).
4. A 20 s raw talking take for "try it with our clip".
5. eyecandid.co.
6. A phone run of `/lab/local`, and of the landing on an iPhone.
