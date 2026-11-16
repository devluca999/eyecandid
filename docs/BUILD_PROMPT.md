You are a world-class product engineer and product designer. Build a working, deployed MVP of Eyelore end to end: a desktop web app and a native mobile app, sharing one backend and one design system. UI/UX and conversion matter as much as architecture. Use the skills, connectors and MCP tools available in this session. The stack is fixed (section 2); do not substitute other services. Work autonomously, in phases, and leave the repo shippable at the end of every phase.

## 0. What Eyelore is
- A video editor for creators and UGC ads. Tagline: "Making real people look great." "From cringe to cinema" is a playful secondary line for marketing copy and comedic moments, not the tagline.
- Promise: drop in raw, awkward clips (real phone footage or AI-generated); get back a polished, captioned, well-paced edit in about a minute, without having to rewatch yourself.
- Principles:
  1. The content is the interface.
  2. Three materials only: paper, glass, chrome.
  3. Every track has an autopilot. The user only handles exceptions, and every automatic decision explains itself in one line ("cut away · you said 'nightstand'").
  4. Polish how it was said, never what was said.
  5. Real footage and generated footage are treated identically.
- Core object: the Lens, one video window that changes shape: theater circle, editing rectangle at true aspect ratio, storyboard card.
- Timeline tracks, in this exact order: video, b-roll, voice, music, captions.

## 1. Read these first (sources of truth)
- `CLAUDE.md`, `docs/product-notes.md` (features, positioning, demo) and `docs/engine-assessment.md` (the existing GPU engine and its problems).
- Brand marks in `brand/` (exact vectors; never redraw).
- Design system (Claude Design): https://claude.ai/design/p/f944d29f-4ea9-4e6f-8ef6-542cda6c05a7 : tokens, components, the editor UI kit. Prototype screens: https://claude.ai/design/p/f202a316-51d3-4f4c-87ea-4f436e319d7f . If you can't open these, check `design/` for an exported copy; if that's empty, ask me to export the design system into `design/` before building UI, and build the non-UI foundation meanwhile.
- The existing media engine in `legacy-engine/` (worker.py, make_cut.py, shoplink_jobs_v2.py, export_templates.py, tts_runner.py, the Remotion kit, the ComfyUI workflow templates, and the Colab notebook). If it's missing, ask me to copy it in.
  - Reuse: ComfyUI + LTX-2.5, Qwen-Image-Edit-2511, Z-Image-Turbo, Chatterbox, faster-whisper word timing, the Remotion cut, ffmpeg QC.
  - Replace: Drive polling, path rewriting, per-brand hardcoded scripts.

## 2. The stack (fixed)
- GitHub for code, CI/CD and releases.
- Vercel for hosting the web app.
- Convex is the backend and the source of truth:
  - data and reactive queries
  - mutations and actions, and scheduled functions
  - HTTP actions for the GPU worker
  - file storage, behind a `MediaStore` interface so large media can later move to S3-compatible storage without app changes
  - the job queue, with leases
- Clerk for auth on web and mobile, integrated with Convex.
- Stripe for payments: credits plus subscription tiers, with webhooks into Convex and entitlements checked server-side.
- Neon (serverless Postgres): use only if a clearly relational, non-realtime need appears (e.g. an analytics warehouse). Justify it in an ADR; do not use it for the core app.
- SendPulse for transactional and lifecycle email (welcome, "your edit is ready", re-engagement).
- Sentry for errors and performance on web, mobile and worker.
- Google Drive: an import source (pick clips from Drive) and the legacy engine's home. Never in the production hot path.
- Mobile: Expo / React Native with EAS Build and EAS Update.
- Web: Next.js (App Router, TypeScript).
- Analytics: a typed event layer writing funnel events to a Convex `events` table, plus Vercel Web Analytics. Keep the layer provider-agnostic.

## 3. Phase 1: foundation, CI/CD and harness (before any feature)
Write `PLAN.md` and short ADRs in `docs/adr/` for every major choice, then build:
- Monorepo (pnpm + Turborepo):
  - `apps/web`
  - `apps/mobile`
  - `packages/ui`: tokens generated from the design system into Tailwind (web) and NativeWind/StyleSheet (mobile), plus shared primitives
  - `packages/core`: the edit model, domain types, zod schemas, the analytics event schema, and the engine job contract
  - `convex/`: schema, functions, HTTP actions
  - `services/engine`: the Python GPU worker, ported from `legacy-engine/`
  - `services/render`: the Remotion renderer
- The edit model is the heart of the system. One versioned JSON document per project: clips → segments (beads) with word timings, tracks, effects anchored to words or moments, captions, style and genre. Every AI operation is a pure transformation of this document, stored as a diff with its one-line reason. This gives undo, explain-on-hover, pinning ("never re-decide what the user touched") and live collaboration through Convex reactivity.
- The engine job contract, in `packages/core`, is the only interface between app and GPU:
  - Job types: `transcribe`, `autocut`, `reframe`, `still`, `i2v`, `t2v`, `voice`, `matte`, `inpaint`, `grade`, `render`.
  - Each job type has typed inputs and outputs, a version, and an idempotency key.
  - Convex HTTP actions for workers: `claim` (lease with timeout), `heartbeat`, `progress`, `complete`, `fail`, `upload-url`, `download-url`.
  - Authenticate workers with per-worker tokens.
  - Expired leases requeue automatically.
- GPU workers are pull-based and outbound-only, so the same worker runs on Colab, Modal or RunPod unchanged. Provider adapters live behind a `GpuProvider` interface.
- CI/CD on GitHub Actions, required on every PR:
  - Checks: lint, typecheck, unit tests (Vitest), Convex function tests, web e2e (Playwright), mobile e2e (Maestro on an EAS preview build), engine tests (pytest with a CPU stub model and a contract test against the job schema), and a visual-regression check on key screens.
  - Previews: Vercel preview deployment per PR, a Convex preview deployment per PR, an EAS preview build per PR.
  - Engine image: build the worker Docker image (CUDA base) on main and on tags, push it to GHCR, and publish a tagged Python package for the Colab bootstrap.
  - Main: deploys to production, with EAS Update for over-the-air JS updates.
  - Feature flags, stored in Convex, wrap every new feature.
- Secrets live only in env vars and in the Vercel, Convex, EAS and GitHub secret stores. Write `.env.example`; never commit keys. Where a key is missing, build the integration behind a clearly labelled stub and list it in PLAN.md under "Needs keys".
Exit criterion: a PR on the empty app goes fully green, deploys web and mobile previews, and a hello-world job round-trips web → Convex queue → worker (CPU stub) → live progress in the UI → result.

## 4. Phase 2: the conversion-critical core loop (before anything else)
The magic moment is: drop a raw clip → within about 60 seconds see a polished cut of yourself → export. Optimize everything for time-to-wow and drop-off.
- No signup to start. An anonymous session can drop a clip and see the result. Clerk signup is asked at export, and the work carries over into the new account.
- Pipeline:
  1. Resumable upload, plus a client-side low-res proxy so the editor opens instantly.
  2. faster-whisper transcription with word timings.
  3. Auto-cut: fillers and silences are struck through, not deleted, and can be restored.
  4. Split into beads at sentences and scene changes.
  5. Detect key moments (hook, best line, CTA).
  6. Auto-captions in a chosen look.
  7. Smart reframe to 9:16 / 4:5 / 16:9 that keeps the face centred.
  8. Loudness normalize and voice clean-up.
- Desktop editor (web), ported from the UI kit:
  - the Lens in theater / edit / board
  - the bead thread: split, trim, moments-only
  - inline caption editing on the footage
  - right-click menu with the aspect-ratio morph
  - the dials (pace, b-roll density, energy) re-editing live
  - inline export pill with a progress ring, and cutdowns (15 / 30 / 60s)
  - the timeline drawer with the five tracks
- Mobile app (native, not a webview). It should feel complete on its own, not like a cut-down desktop:
  - in-app capture with a teleprompter: line-by-line takes, say a line again to retake
  - camera-roll import and background upload
  - full-screen review in the theater Lens
  - light edits: captions, restore or cut beads, aspect ratio
  - export to the camera roll and the share sheet
  - haptics and native gestures throughout
- Empty state is the idea engine: "What's the idea?" The model critiques the hook, offers 3 sharper angles and drafts a beat sheet as ghost cards. Templates appear as ghost rows.
- Free tier: watermark plus limited minutes. The paywall appears at the moment of highest intent (exporting a finished edit), never before the user has seen value.
- SendPulse sends "your edit is ready" when a long job finishes while the user is away.
Exit criterion: on both platforms, a new user goes from landing to an exported, captioned, reframed video in under 3 minutes of their own time. A Playwright test and a Maestro test prove it.

## 5. Phase 3: autopilots and AI editing (each behind a flag, each explaining itself)
- Genre switcher: one control that re-cuts the same footage as a genre. Each genre is a recipe, stored as data in the edit model and fully reversible:
  - Recipe contents: pacing, which beats and moments are favoured, shot length, punch-ins and angle preference, colour grade, music and sound design, caption style, transitions.
  - Comedy: brighter, more saturated grade; comedic timing (holds before punchlines, quick reaction cuts); optional laugh track and stingers; playful captions. "From cringe to cinema" lives here.
  - Horror: desaturated, cold, crushed blacks; slow push-ins; long holds; low drones and stingers; jump-cut timing on reveals.
  - Thriller: tension pacing, accelerating cuts toward the reveal, ticking or pulsing score, tight framing.
  - Action / sports-ad: high-contrast grade; fast close cuts on motion; speed ramps; impact sound on the beat; bold minimal type. In the spirit of big sports-brand ads, without copying any brand's marks, slogans or footage.
  - Also: romance, documentary, luxury, retro.
  - The switcher re-selects clips and moments to suit the genre, not just the filter. Each change shows its reason on hover ("held 0.6s before the punchline", "cut on impact").
  - Previews: show a few genre previews side by side as small Lenses before applying.
- Weave: raw main clip plus raw b-roll → automatic cutaways.
  - Stay on the face for the hook, claims and the CTA.
  - Cut to b-roll on descriptive lines and on spoken nouns the b-roll shows (tag b-roll with a vision model).
  - Cutaways run about 1.5–3s, cut on word boundaries, with a density dial. Hover shows the reason; dragged windows are pinned and never re-decided.
- Take mixer: several takes of a script → aligned by transcript → the best delivery per line is stitched together.
- Select and talk: brush a region (tracked with SAM 2) or a time span, then type or speak an instruction. Supported operations: background replace, remove object, relight, grade from a reference image. Before/after slider; keep / try again.
- B-roll sheet: plain-language search over the user's library and Google Drive imports, plus "generate" through the engine (matched to the clip's grade); drag to insert.
- Music that fits itself: trim to length, cuts on the beat, duck under voice, resolve at the end.
- Voiceover: record onto the voice track, or use a cloned voice. Cloning the user's own voice only, with explicit consent recorded.
- Saved styles: capture rhythm, zooms, grade and caption look; set a project default. Genres and saved styles share one recipe format.
- Sets and word-anchored effects: subject matting plus a generated environment plus relighting; effects attached to transcript words or detected moments. Mark this experimental.

## 6. UX and conversion standards (apply everywhere)
- Follow the design system exactly. No sidebars, stat cards, gradient washes or emoji. One accent colour, used only for selection.
- Progressive disclosure: footage first; controls on hover, selection or a shortcut; a "?" shortcut sheet and a skippable first-run tour.
- Every wait shows real progress (Convex live updates) and something useful: a low-res preview that resolves, never a bare spinner. When the GPU is cold, say so honestly and estimate the wait.
- Performance budgets:
  - web: LCP under 2.0s on the landing page; editor interactive under 1.5s with the proxy loaded
  - mobile: cold start under 2s
  - interactions: 60fps
- Accessibility: WCAG AA contrast in both themes, full keyboard support on desktop, VoiceOver/TalkBack labels on mobile, captions on by default.
- Trust: never change the meaning of what someone said. AI retouching is subtle and listed in edit history. Generated or edited content is labelled where platforms require it.
- Landing page: one hero demo video, the line "Making real people look great", and a drop zone right on the landing page. Instrument it and A/B test the hero line.

## 7. How to work
- Before writing code, put in PLAN.md: the architecture diagram (Mermaid), the data model, the job contract, the funnel, the risks, and a milestone checklist. Keep it updated as you go.
- Work in small PRs with tests. Never mark a phase done while CI is red.
- Never fake functionality. If something can't work yet (a missing key, the GPU unavailable), ship an honest, labelled stub, keep the UI path working, and list it in PLAN.md.
- At the end, write `HANDOFF.md` covering:
  - live URLs, how to run locally
  - how to run the engine worker on Colab and on serverless GPU
  - what's real vs stubbed, and the keys still needed
  - the funnel dashboard
  - the top 5 next steps, ranked by expected impact on conversion
