# Eyecandid

(Formerly Eyelore. User-facing name is **Eyecandid**, lowercase `eyecandid` in the lockup and URLs; internal package, env, Convex, Vercel and Modal names stay `eyelore` — see ADR 0011.)

A video editor for creators and UGC ads. Tagline: **Making real people look great.** ("From cringe to cinema" is a playful secondary line only.)

Picking the project up? Start with `MANIFEST.md` (what this is, where things live, the owner's rules, how to work here).

Read before any work: `docs/mvp-spec.md` (the Eyecandid MVP spec: what ships, access model, cost limits, phases — it takes precedence over older phase plans), `docs/BUILD_PROMPT.md` (the original full brief), `docs/product-notes.md`, `docs/engine-assessment.md`. Track progress in `PLAN.md`; record decisions in `docs/adr/`.

## Stack (fixed; do not substitute)
GitHub · Vercel · Convex (data, realtime, queue with leases, file storage behind `MediaStore`, HTTP actions for workers) · Clerk · Stripe · SendPulse · Sentry · Expo/EAS · Next.js App Router · pnpm + Turborepo. Neon only via an ADR for a clearly relational, non-realtime need. Google Drive is an import source only. No Supabase, Resend, PostHog or Higgsfield.

## Non-negotiables
- The edit model (one versioned JSON doc per project) is the source of truth; every AI change is a diff with a one-line reason; user-touched items are pinned.
- The GPU engine talks to the app only through the typed job contract in `packages/core`, pulling jobs from Convex (outbound-only), so it runs on Colab, Modal or RunPod unchanged.
- Follow the design system exactly (paper, glass, chrome; one accent for selection only; no sidebars, stat cards, gradient washes or emoji). Brand marks are in `brand/`; never redraw them.
- Never fake functionality: missing keys or GPU → labelled stub + listed in PLAN.md "Needs keys".
- Never commit secrets. `.env.example` only.
- Small PRs, CI green before a phase is done. Polish how someone said it, never what they said.

## Legacy engine
`legacy-engine/` holds the existing Colab engine (copied from Google Drive `everstock-media/_engine/`). Port what works into `services/engine`; don't import from it at runtime.
