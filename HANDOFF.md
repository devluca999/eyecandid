# Eyelore: handoff

*Making real people look great.* State of the build on 2026-11-16. Scope and status by milestone: [`PLAN.md`](PLAN.md). Decisions: [`docs/adr/`](docs/adr). Brief: [`docs/BUILD_PROMPT.md`](docs/BUILD_PROMPT.md).

## 1. Live

| what | where |
|---|---|
| Web | https://eyelore.vercel.app (Vercel project `everstock/eyelore`, root `apps/web`; `main` deploys through `.github/workflows/deploy.yml`) |
| Backend, production | Convex `hushed-heron-814` (team `SQco`, project `eyelore`) |
| Backend, development | Convex `deafening-hedgehog-824` |
| Workers | Modal apps `eyelore-worker-prod` and `eyelore-worker` (always-on CPU: transcribe, autocut, reframe, render) |
| Mobile | Expo project `@devluca999/eyelore`; EAS Update publishes the JS on `main`. No store or TestFlight build exists yet |
| Funnel | `/funnel` on the web app, once `EYELORE_ADMIN_TOKEN` is set on the Convex deployment (section 5) |

## 2. Run it locally

```sh
pnpm install
pnpm convex:dev                         # local Convex backend on :3210 / :3211 (anonymous until `npx convex login`)
cp .env.example apps/web/.env.local     # NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210
pnpm --filter @eyelore/web dev          # http://localhost:3000
```

A real CPU worker against that backend (needs ffmpeg and Node):

```sh
cd services/engine && uv venv --python 3.12 && uv pip install -e '.[cpu]'
export EYELORE_CONVEX_SITE_URL=http://127.0.0.1:3211
export EYELORE_WORKER_TOKEN=$(npx convex run workers:register '{"name":"me","provider":"cpu"}' | jq -r .token)
EYELORE_PROVIDER=cpu .venv/bin/eyelore-worker
```

Mobile (native build, not Expo Go):

```sh
cd apps/mobile
echo 'EXPO_PUBLIC_CONVEX_URL=http://127.0.0.1:3210' > .env.local   # a LAN address for a real device
npx expo run:ios        # or: npx expo run:android
```

Simulators have no camera. A development build can start an edit from a clip URL through `app/dev.tsx`, which redirects home in release builds.

Tests: `pnpm turbo run lint typecheck test` · `pnpm convex:test` · `cd services/engine && .venv/bin/pytest` · `pnpm --filter @eyelore/web e2e` (with `E2E_WORKER=1 E2E_REAL_WORKER=1` and a worker running) · mobile: `maestro test apps/mobile/.maestro` against an installed build (CI does this on an Android emulator; see `apps/mobile/.maestro/run-ci.sh`).

## 3. The engine worker

One codebase, pull-based and outbound-only. It claims jobs from Convex over HTTPS; only `EYELORE_PROVIDER` differs between hosts. Every worker needs `EYELORE_CONVEX_SITE_URL` (`https://<deployment>.convex.site`) and `EYELORE_WORKER_TOKEN` (from `npx convex run workers:register '{"name":"…","provider":"…"}'`, shown once; add `--prod` for production).

- **Modal (what runs today):** `uvx --from modal modal deploy services/engine/deploy/modal_app.py` for the development backend, `EYELORE_ENV=prod uvx --from modal modal deploy services/engine/deploy/modal_app.py` for production. Modal secrets `eyelore-worker` and `eyelore-worker-prod` hold the two variables. A run starts every 25 minutes and polls for 30, so one CPU worker is always warm.
- **Colab:** `pip install` the wheel attached to the latest GitHub release (built on tags by `deploy.yml`), put the two variables in Colab secrets, then `EYELORE_PROVIDER=colab eyelore-worker`.
- **RunPod or any GPU host:** run `ghcr.io/devluca999/eyelore-engine:main` with the two variables and `EYELORE_PROVIDER=runpod`.
- **Serverless GPU for generation (Phase 3):** not deployed. The plan is a second Modal function on the same image with a GPU; the generation job types exist in the contract but have no handlers yet.

## 4. Real and stubbed

**Real, and proven**
- Web core loop: drop a clip with no signup, transcript, fillers and pauses struck (restorable), beads, moments, captions, face-centred reframe, loudness, export with cutdowns. Playwright runs it in CI with a real CPU worker; against production it took 56s.
- The edit model: every change is an op with a one-line reason; undo, explain-on-hover and pinning work from the log.
- The job contract, queue with leases, worker HTTP API and lease requeue.
- Mobile app: see PLAN.md 2.3 for exactly what was exercised and how.

**Built, waiting on keys** (each switches on with its variables and its Convex flag; until then the path works and says so)

| integration | what happens without keys | to switch on |
|---|---|---|
| Clerk accounts, with the anonymous work claimed on signup | exports stay anonymous; one line says accounts aren't connected | Clerk app; JWT template named `convex`; `CLERK_JWT_ISSUER_DOMAIN` and `CLERK_WEBHOOK_SECRET` on Convex; `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` and `CLERK_SECRET_KEY` on Vercel; webhook to `<convex site>/clerk/webhook`; flag `accounts` |
| Stripe paywall and entitlements | free rules only: watermark, 60s cap, no paywall | products and prices; `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `STRIPE_PRICE_*`, `EYELORE_WEB_URL` on Convex; webhook to `<convex site>/stripe/webhook`; flag `billing` |
| SendPulse "your edit is ready" | a `notifications` row reads "not sent · SendPulse not configured" | `SENDPULSE_CLIENT_ID`, `SENDPULSE_CLIENT_SECRET`, `SENDPULSE_FROM_EMAIL` on Convex; flag `ready_email` |
| Sentry (web and worker) | nothing initialises | `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN`; `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` for source maps |

Plan names, limits and prices in `packages/core/src/plans.ts` are placeholders until the owner decides them.

**Not built**
- Idea engine empty state (needs an LLM provider and key).
- Resumable chunked upload and an uploaded proxy.
- On mobile: Clerk, the paywall (needs an in-app-purchase decision), Sentry, Geist fonts, an Android foreground service for long uploads.
- Phase 3: every autopilot (genre switcher, weave, take mixer, select and talk, b-roll sheet, music, voiceover, saved styles, sets).

## 5. The funnel

Events are typed in `packages/core/src/analytics.ts` and written to the Convex `events` table (and Vercel Web Analytics on the web):

`landing_view → drop_started → upload_done → first_preview → edit_interaction → export_clicked → signup_prompted → signup_done → paywall_shown → export_done → share`

The dashboard is `/funnel` on the web app: sessions per step, step-to-step conversion, time-to-wow (median and p90 of `first_preview.msSinceDrop`, target 60s), and splits by platform and by hero-line arm. Switch it on with `npx convex env set EYELORE_ADMIN_TOKEN <value> --prod`, then open `/funnel` and enter the value. It reads the newest 1,400 events per step and says so when a step is truncated.

## 6. CI and deploys

- Every PR: lint, typecheck, unit tests, Convex function tests, engine pytest and contract test, web e2e with visual regression (local Convex and a real CPU worker), a Vercel and Convex preview, the engine image build, a secret scan.
- Mobile e2e: when mobile-relevant paths change, the Android app is built on the runner and Maestro runs the core loop on an emulator against a local Convex and a real CPU worker. EAS cloud builds are not used in CI: on the free tier one takes 30 to 45 minutes with the queue (ADR 0008, amendment). They work, and are the route to real-device previews and the stores: `eas build --profile preview`.
- `main`: Convex and Vercel to production, EAS Update, engine image to GHCR. Tags: the engine wheel as a release asset.

## 7. Next steps, by expected effect on conversion

1. **Connect Clerk and Stripe and decide the plans.** Signup at export and the paywall are built and dark. Nothing can convert until they are on.
2. **Put the mobile app on real phones** (a TestFlight and an internal Android build), and shoot with the teleprompter on a device: capture has never run on real hardware.
3. **Make render faster.** It is the slowest step of the loop on CPU (about 85s for a 19s export). A GPU or a lighter render path shortens the wait at the moment of highest intent.
4. **Resumable upload with a proxy**, so long phone clips survive a bad connection; today a dropped upload starts over.
5. **The first autopilot: the genre switcher**, behind a flag. It is the most visible "one tap, new edit" moment and needs no GPU for pacing, grade and captions.
