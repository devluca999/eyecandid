# Flows: every way in, every path, every state

Crawled on 2026-11-17 against a local production build (`next build && next start`) on the **development** backend
(`deafening-hedgehog-824`), never production. Desktop 1440×900, phone 390×844, small phone 320×568. Server engine
pinned with `localStorage["eyelore.engine"] = "server"`; device engine in a headed Chrome with a real GPU
(`shoplink-ring-02.mp4`, 20 MB portrait). No worker runs on dev, so the server path was proven up to its honest cold
state; CI proves the rest with a real CPU worker (`core-loop.spec.ts`). Findings, ranked: [`findings.md`](findings.md).
The durable crawler: `apps/web/e2e/ux-crawl.spec.ts`.

Legend: **✓** crawled and fine · **fixed** crawled, was wrong, fixed in the UX-crawl PR · **finding** left for the
owner (see findings.md) · **code** read, not exercised live.

## 1. Entry points

| Entry | Who | Lands on | State |
|---|---|---|---|
| `/` desktop | everyone | hero line (A/B: "Making real people look great." / "Drop your rawest clips."), drop well, scattered clips | ✓ |
| `/` phone | everyone | same; the well sits just above the fold at 390, below it at 320 | ✓ · finding (320 tile overlaps the meta line) |
| `/#how`, `/#pricing` | nav, footer, editor's Pro line | the section | ✓ anchors resolve |
| `/edit/<id>` | the person who dropped it (anon id in this browser, or their account) | the editor | ✓ |
| `/edit/<id>` in another browser | someone sent the link | "not found · This edit isn't yours, or it doesn't exist." + "start an edit" | ✓ honest; finding (no share) |
| `/edit/<garbage>` | a mistyped or truncated link | was "something broke"; now the not-found state | fixed |
| `/terms`, `/privacy`, `/credits` | footer | draft legal pages, footage credits | ✓ |
| `/funnel`, `/admin/access` | owner only, token-gated, `noindex` | token field; wrong token → "token not accepted · try again"; no token on the backend → "not configured" | ✓ (CI checks the real token) |
| `/pro/checkout?token=…` | approved people, from the invite email | checking → invalid / billing off / sign-in off / Clerk sign-up → Stripe | ✓ invalid; fixed (said "you're in" on a bad link) |
| `/pro/checkout?checkout=success|canceled` | back from Stripe | "payment received…" / "checkout canceled · nothing was charged" | code |
| any other path | typo, old link | was Next's default black-on-white 404; now a branded "nothing here" + "drop a clip" | fixed |
| `/hello`, `/lab/local` | engineering | job round-trip demo, on-device lab | ✓ renders; not linked (fine) |

## 2. Start an edit (landing)

| Path | What happens | States the person sees |
|---|---|---|
| Click / tap the well or "drop a clip" | file picker (phone: camera roll / camera) | — |
| Drop a file anywhere on the window | the window drop target takes it ("let go" over the well) | — |
| Drop before the backend chunk loaded | queued in the shell, handed over when Convex/Clerk load | "reading your clip…" sweep |
| "no take yet? try it with our clip" | hosted sample through the same pipeline | hidden: `NEXT_PUBLIC_SAMPLE_CLIP_URL` not set → finding |
| Pricing "start now" | scrolls to and focuses the hero well | ✓ |
| Final section well | same uploader | ✓ |

After the pick, in order: **probe** in the browser → **engine** (device if `on_device` and WebGPU + WebCodecs, else
server) → **preflight** (new: caps and pause, before a project exists) → **create** → device: register the clip, open
the editor, transcribe here; server: open the editor, upload, register.

| Case | What the person sees | Where | Status |
|---|---|---|---|
| Not a video (`.txt`) | "that file doesn't look like a video" | landing, under both wells | ✓ |
| Zero-byte / corrupt `.mp4` | same line | landing | ✓ |
| Over 60 s (free) | "free clips are up to 60 s · trim it or request pro" | landing (was: editor opened, full upload, refusal, stuck "uploading" in your edits) | fixed |
| Over 200 MB (free, server engine) | "free files are up to 200 MB · compress or trim it, or request pro" | landing, before any upload | fixed (preflight); code |
| Free paused (`free_paused` on, or the daily cap) | "free edits are paused for today · back tomorrow" (server engine; device stays open) | landing | ✓ on dev (flag on, then off) |
| Rate limit (20 creates/h/session, 40/h/IP hint) | "you're going a bit fast · try again in a few minutes" | landing | code (#29 brings the hint) |
| Two drops at once / drop while reading | the second is ignored; one edit | landing | fixed (was two projects) |
| No speech (device) | editor: "no speech found · try a clip where someone talks" | editor | code |
| No speech (server) | worker marks the project failed with its reason | editor | code (needs worker) |
| Offline / upload fails (server) | "uploading · 0%" → "upload failed · check your connection and drop it again" | editor | ✓ · finding (no retry button; the file is still in the tab) |
| Slow 3G first paint (phone) | h1 and well paint at ~3.2 s; uploader live within ~8 s | landing | ✓ |
| Browser without WebGPU | server engine (same as the pin) | — | ✓ |

## 3. The editor

Modes: **theater** (circle, night, plays) · **edit** (true aspect, thread, dials, export) · **board** (cards). Keys:
1/2/3, space, ⌥T timeline, ⌘Z undo, ? shortcuts, M moments, ⌫ cut bead, Esc one layer.

| State | Server engine | Device engine |
|---|---|---|
| Uploading | "uploading · N%" | — (never uploaded) |
| First visit model download | — | "getting the editor ready · N of 206 MB · once per device" (fixed: read "209 of 206") |
| Working | "listening / trimming fillers and pauses / finding your face · N%" | "reading the sound / listening / trimming the ums · on this device" |
| Cold (no worker) | "no engine is running right now · your clip starts when one comes online" (or "waking up", or "isn't answering") | — |
| Ready | autoplay off; summary "N fillers trimmed · N pauses cut · hover to see why"; first-run tour | same (7 s drop → ready with the model cached; 38 s on first visit) |
| Failed | the stage detail, attention dot | "couldn't edit on this device · <why>" |
| Reloaded / new tab | plays from the uploaded source | edit doc is there, clip isn't: was a placeholder figure in the Lens and "drop it again here" with no drop target; now "choose it again" | 
| Another browser | not found (anon ownership) | not found |
| Leaving mid-edit | ready-email form after 15 s or on tab hide — only while `ready_email` is on (fixed: it promised an email that is never sent) | not offered (the tab must stay open) |

Interactions crawled: strike / restore a word, cut / keep a pause, select a bead and cut it, ⌘Z, raw take vs edit,
aspect 9:16 / 4:5 / 16:9 (morphs the Lens), cutdowns 15/30/60 s, dials (pace, b-roll, energy), timeline drawer,
shortcuts sheet, tour (skip, arrows), theme toggle (paper / night), delete (in-app confirm, "keep", "delete").

## 4. Export, download and after

| Step | What happens | Status |
|---|---|---|
| Export (anonymous, no Clerk key) | free, watermarked; meta line "free export · watermarked · accounts aren't connected yet" | ✓ |
| Export with `accounts` on | Clerk sign-up modal over the editor; anon work claimed; export continues; closing it cancels | code (no Clerk key on dev) |
| `paid_required` with `billing` on | paywall modal: reason line, plan buttons, "export free", "not now" | code |
| Rendering | ring on the Lens, "rendering · N%" / "rendering on this device" | ✓ device |
| Done | "ready · download · again" | ✓ |
| Download (device) | blob, named `<title> - eyecandid.mp4` (was `eyecandid.mp4`) | fixed |
| Download (server) | was a cross-origin link (browsers ignore `download`, the video replaced the editor); now fetched on click and saved with the same name | fixed (CI core-loop checks the href) |
| Export twice ("again") | a second export with the same settings | ✓ |
| After a free export | one line: "want no watermark, longer clips and generated b-roll? request access" → `/#pricing` | fixed (was missing; spec step 8) |
| Export failed | "export failed · <reason>" (now wraps on phones) | code |
| Export after reload (device) | "this clip stays on the device you dropped it on · choose it again below to export" | fixed |

## 5. Your edits, delete, revisit

| Path | What happens | Status |
|---|---|---|
| Landing "your edits" | up to 6 edits from this browser, "title · stage" | ✓ · finding (duplicate titles look identical; stuck entries) |
| Long titles | truncated with an ellipsis | ✓ 320 px |
| Delete | quiet "delete" → in-app confirm ("…can't be undone") → keep / delete → home | ✓ |
| Revisit a deleted edit | "This edit isn't yours, or it doesn't exist." | ✓ |

## 6. Pro and the owner

| Path | What happens | Status |
|---|---|---|
| Pricing "request access" | form opens (email, what you make, link) | ✓ |
| Bad email | browser holds the form (type=email) | ✓ |
| Duplicate request | "got it · we'll email you when there's a seat" (no leak that it's a duplicate) | code |
| Too many today | "you've already asked today · we'll be in touch" | code |
| Admin approve / decline | seats used of 100, email outcome honest ("not sent · SendPulse not configured") | CI (`admin-access.spec.ts`) |
| Invite link → checkout | sign up / sign in with the approved email → Stripe | code (billing off on dev) |

## 7. Cross-cutting

| Check | Result |
|---|---|
| Console errors, failed requests on every route | none, except `/_vercel/insights/script.js` (only exists on Vercel) |
| Broken links / anchors | none |
| Controls without an accessible name | none on any route (the `/lab/local` file input is unlabelled; lab only) |
| Keyboard order (landing) | home, how it works, pricing, drop a clip, the well, the reel tiles, skip the walkthrough, genres… every stop shows a focus ring |
| Reduced motion | posters, nothing pins, walkthrough shows the finished edit (`landing.spec.ts`) |
| Dark / light | the editor has paper / night (theater is night); the landing is paper only |
| Horizontal scroll | none at 1440, 390 or 320, landing or editor |
| Phone editor header | fixed (the view switch ran into "delete") |
