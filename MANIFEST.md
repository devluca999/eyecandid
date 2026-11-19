# Eyecandid · project manifest

Start here if you are picking this project up: another Claude session, an agent, or Luca on another account. This file holds what doesn't change often (what the product is, where things live, the rules, how to work). Current state lives in the files under **Where we are now**; read those next.

## 1. What this is

**Eyecandid** (formerly Eyelore) is a video editor for creators and UGC ads. Tagline: **Making real people look great.** ("From cringe to cinema" is a playful secondary line only.)

The core loop: someone drops a raw talking clip, gets back an auto-cut edit with captions and reframing, and exports it. Ums and pauses are removed, and each change comes with a one-line reason they can undo or pin.

- **Free:** no signup, one watermarked export. The edit runs **on the visitor's own device** when the browser can (WebCodecs, plus WebGPU or else the CPU in WebAssembly for Whisper; ADR 0012, 0016). Otherwise it runs on a CPU worker.
- **Pro:** by request, capped at 100 seats. Approved users pay through Stripe and get no watermark, longer clips, and GPU features paid with credits.
- **Web first.** The Expo mobile app exists but waits for store submission.
- **Owner:** Luca (GitHub `devluca999`). Luca decides product, pricing, spend and anything outward-facing.

## 2. Read in this order

1. `CLAUDE.md`: the stack and the non-negotiables (binding).
2. `docs/pricing-and-quality-plan.md`: **the goal**, set 17 Nov 2026: plans, credits, and what makes the edits undeniably good. Its last section lists where it differs from what's built.
3. `docs/mvp-spec.md`: the MVP scope, access model, cost limits and Phases 0–5 with acceptance lines.
4. `docs/adr/`: every consequential decision (0001–0012+). Read 0002 (edit model), 0003 (job queue), 0009 (entitlements), 0010 (scale to zero), 0011 (rename map) and 0012 (on-device engine) before touching those areas.
5. `PLAN.md` (phase checklist and the "Needs keys" table) and `HANDOFF.md` (how to run, deploy and operate).
6. `docs/product-notes.md`, `docs/engine-assessment.md`, `docs/credits.md` (stock footage licences), `docs/rate-limiting.md`.

## 3. Where we are now (living state; trust these over this file)

- **Open work:** `gh pr list` (each PR body says what it does, what's proven and what's left).
- **Phase status and blockers:** `PLAN.md` and `HANDOFF.md`.
- **What's live:** https://eyecandid.vercel.app (also eyelore.vercel.app). The domain eyecandid.co is deferred by the owner.
- **Recent decisions:** `git log --oneline -30` on main, plus new ADRs.
- `.hyperadvisor/AFK.md` is the owner's local dashboard on his Mac. It is gitignored, so it isn't in the repo.

## 4. Map of the repo

| Path                                               | What                                                                                                                                                                                                                                                                                  |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web`                                         | Next.js App Router site: the landing (`app/page.tsx`, `hero.tsx`, `uploader-shell.tsx` loads the backend lazily, `drop.tsx` is the real uploader), the editor (`app/edit/[id]`), `/admin/access`, `/funnel`, `/pro/checkout`, legal and credits pages, and Playwright tests in `e2e/` |
| `apps/web/lib/device-engine.ts`, `lib/cut-web.tsx` | the on-device engine: Whisper on WebGPU (or on the CPU in WebAssembly, `lib/wasm-whisper.worker.ts`), MediaPipe face track, and the browser render                                                                                                                                                                                                 |
| `apps/mobile`                                      | the Expo app (EAS)                                                                                                                                                                                                                                                                    |
| `packages/core`                                    | the single source of truth for types: the edit model, the job contracts (zod, also emitted as JSON Schema for the Python worker), autocut (TS twin of the Python one), plans, flags, analytics events, cost                                                                           |
| `packages/ui`                                      | the design system components                                                                                                                                                                                                                                                          |
| `convex/`                                          | backend: schema, projects/edits, the job queue with leases, the pipeline, exports and entitlements, access/Pro, flags, limits and rate limits, the expiry cron, the funnel, notifications (SendPulse), Stripe webhook. Tests are `*.test.ts` (convex-test)                            |
| `services/engine`                                  | the Python pull-based worker (transcribe, autocut, reframe, render, hello) and the Modal apps                                                                                                                                                                                         |
| `services/render`                                  | the Remotion server render (`Cut.tsx`)                                                                                                                                                                                                                                                |
| `scripts/media`                                    | builds the self-hosted landing loops from Mixkit (`clips.tsv`). The site never loads Mixkit URLs                                                                                                                                                                                      |
| `scripts/lab`                                      | real-GPU browser runs of the on-device flow (`device-flow.mjs`)                                                                                                                                                                                                                       |
| `scripts/merge-queue.sh`                           | merge PRs in order on green CI                                                                                                                                                                                                                                                        |
| `brand/`                                           | the product marks. Use them as they are; never redraw them                                                                                                                                                                                                                            |
| `legacy-engine/`                                   | the old Colab engine, kept for reference only. Never import it at runtime                                                                                                                                                                                                             |

## 5. Accounts and environments (no secrets here, ever)

- **GitHub:** `devluca999/eyecandid` (public). CI is `.github/workflows/ci.yml`. Deploys come from main via `deploy.yml` (Convex prod + Vercel + EAS Update + GHCR image).
- **Convex:** prod `hushed-heron-814`, dev `deafening-hedgehog-824`. Local work and tests use dev or a local backend. **Never point local tests at prod.**
- **Vercel:** project "eyelore" (the internal name is kept, per ADR 0011).
- **Modal:** apps `eyelore-worker` (dev) and `eyelore-worker-prod`. The workspace is at its spend cap, so **no worker runs in production now**. That's why free edits run on-device.
- **Keys not set yet** (each shows a labelled "not configured" state; the full list is PLAN.md "Needs keys"): Clerk, Stripe, SendPulse, Sentry, an LLM provider, `EYELORE_ADMIN_TOKEN`, `EYELORE_HINT_SECRET`, `EYELORE_CPU_USD_PER_HOUR`.
- Env var names live in `.env.example`. Values live only in the services' dashboards and env stores. Never commit or print a secret.

## 6. Rules (from the owner; binding)

- **Fixed stack:** GitHub, Vercel, Convex, Clerk, Stripe, SendPulse, Sentry, Expo/EAS, Next.js, pnpm + Turborepo. No substitutes and no new services. Neon only via an ADR. No Supabase, Resend, PostHog or Higgsfield.
- **The edit model is the source of truth:** one versioned JSON document per project. Every AI change is a diff with a one-line reason, and anything the user touched is pinned. Polish _how_ someone said it, never _what_ they said.
- **Never fake functionality.** A missing key or GPU gets a labelled stub plus a row in PLAN.md "Needs keys". No fake quotes, handles, logos or numbers anywhere.
- **Design system exactly:** paper, glass, chrome; one accent, used for selection only. No sidebars, stat cards, gradient washes or emoji.
- **Landing footage:** self-hosted, each clip appears once on the page (`lib/clips.test.ts`), and the licence is checked on the clip's own page. Some Mixkit clips are personal-use only.
- **Internal names stay `eyelore`** (packages, env vars, Convex, Vercel, Modal, browser storage keys; see ADR 0011).
- **Ask the owner first:** spending money, raising a plan, `modal deploy`, redeploying any always-warm worker, creating accounts or Stripe prices, sending email as the owner, touching Stripe/Clerk/SendPulse dashboard settings, deleting production data.
- **Git:**
  - Never push to main; every change goes through a PR with green CI and a squash merge.
  - Never force-push. If a stacked PR's base got squash-merged, rebase it onto main as a new branch and open a new PR, or merge main into the branch.
  - Never retry a permission that was denied by finding another route; ask the owner.

## 7. How to work here

- **Setup:** `pnpm install` (pnpm 12; settings live in `pnpm-workspace.yaml`, not `.npmrc`). `npx convex dev` links a deployment.
- **Checks before any PR:** `pnpm turbo run lint typecheck test` plus `pnpm convex:test`. Web e2e and visual tests run in CI against a local Convex and a real CPU worker. Mobile e2e (Android + Maestro) runs only when mobile inputs change and takes about 25 minutes.
- **Run the site locally:** in `apps/web`, create an untracked `.env.local` with `NEXT_PUBLIC_CONVEX_URL` set to the **dev** deployment URL, then `pnpm build && pnpm start` (port 3000). Push functions to dev with `npx convex dev --once`.
- **Prove the on-device path in a real browser:** `node scripts/lab/device-flow.mjs <clip.mp4> <out.mp4>` (headed Chrome, real GPU). CI can't run WebGPU, so tests pin the engine with `localStorage["eyelore.engine"] = "server" | "device" | "wasm"` (wasm: the CPU transcriber even where WebGPU exists; `LAB_ENGINE=wasm` in the lab script).
- **Merging:**
  - `scripts/merge-queue.sh <pr> <pr> …`, one queue at a time.
  - When a PR conflicts, merge `origin/main` into its branch, resolve, run the checks, then push.
- **Commits and PRs:**
  - Small and focused. The message says what changed and how it was proven.
  - Write long messages and PR bodies to a file and pass them with `-F` / `--body-file`, because inline quotes break the shell.
- **Agents:**
  - Give each one its own git worktree and a narrow brief that lists the files to read and what not to touch.
  - Tell running agents when another agent takes over the same files.
  - Agents open PRs; they don't merge them.
  - Cheaper models (sonnet) for wiring and tests; opus for money, auth, quality heuristics and concurrency.
- **Decisions:**
  - Record anything consequential as a new ADR.
  - Keep PLAN.md checkboxes and HANDOFF.md truthful.
  - Batch questions for the owner into one ask with exact steps.

## 8. If you're picking this up cold

1. Read section 2, then run `gh pr list` and `gh run list -L 10`.
2. Check whether a merge queue or agents are still running (ask the owner) before you start merging.
3. Re-run the checks on main and keep the live site working; it is what people see.
4. Pick the next item from `docs/pricing-and-quality-plan.md` or PLAN.md that isn't blocked on the owner. Open a PR with proof.
5. Anything blocked on keys, money or the domain goes into one batched ask for Luca, with exact clicks.
