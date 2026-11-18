# UX crawl: findings

2026-11-17. How it was crawled and every flow's states: [`flows.md`](flows.md). Ranked by **impact × effort**
(impact on "a stranger lands, drops a clip and downloads an edit", 1–5; effort 1 small … 5 large). Evidence
screenshots in [`shots/`](shots/) (small JPEGs); the rest are reproducible with the steps given.

**Fixed in this PR** are small, clearly right and inside the design system. **Left** needs a design or product call,
touches something this crawl was told not to change (pricing, billing rules, clips, copy owned by the copy PR), or
is larger than a fix.

## Ranked

| # | Finding | Impact | Effort | Status |
|---|---|---|---|---|
| 1 | On-device edit reopened after a reload: the Lens showed the design-system placeholder figure (not your clip) and export said "drop it again here", but the editor has no drop target. A dead end on the free tier's main path. | 5 | 2 | **fixed**: "choose it again" (same length ±1 s) puts the clip back; plays and exports. `shots/device-reload-before.jpg`, `shots/device-reload-choose-again.jpg` |
| 2 | A clip over 60 s (or a file over 200 MB) on the server engine opened the editor, uploaded in full, then was refused; the project stayed in "your edits" as "uploading" forever, and the bytes stayed in storage. | 5 | 2 | **fixed**: `projects.preflight` refuses on the landing before a project exists; server caps unchanged |
| 3 | "Leave your email and we'll send it when it's ready" appeared on every slow server edit, but nothing sends without the `ready_email` flag and SendPulse keys (neither set). An honesty breach at the moment trust matters most. | 4 | 1 | **fixed**: shown only while `ready_email` is on; a failed save says a plain line, not "Server Error" |
| 4 | Server exports: "download" pointed at the Convex storage origin; browsers ignore `download` cross-origin, so the video replaced the editor (no way back but Back). | 4 | 1 | **fixed**: fetched on click, saved as `<title> - eyecandid.mp4`; on failure opens in a new tab (Convex storage answers CORS for the site's origin; core-loop now clicks it in CI) |
| 5 | No next step after the first export (mvp-spec step 8, "offer Pro, don't push it"). The moment value is felt had no ask. | 4 | 1 | **fixed**: one quiet line under the export pill after a free export → `/#pricing`. `shots/phone-exported-after.jpg` |
| 6 | **The first visit on the device engine waits ~30 s on a 206 MB model download** before anything happens (38 s drop → ready; 7 s once cached). The clip doesn't play meanwhile, so the value is invisible for the slowest half-minute. | 5 | 3 | **partly fixed** (drop-flow PR): the raw clip plays in the Lens during the download, with the honest "getting the editor ready · X of Y MB · once per device" line. The wait itself is unchanged (same model) |
| 7 | **No worker runs in production.** Browsers without WebGPU + WebCodecs (Firefox, older Safari, many Android) get "no engine is running right now · your clip starts when one comes online" and never finish, while the landing promises "about a minute". | 5 | 2 (owner) | **fixed** (drop-flow PR, owner chose "both"): when the browser can't edit on-device and no worker is live or wakeable, the landing says so beside the well and refuses the drop (no project, no upload). Raising the Modal cap is still the owner's call |
| 8 | Phone (390): when the edit is ready, the export pill and the summary line sit below the fold, under the thread; the shortcuts and timeline pills covered the summary. | 4 | 3 | **fixed**: shortcuts pill hidden on touch screens; the export pill is sticky at the bottom on phones, so it stays on screen when the edit is ready |
| 9 | Mistyped / truncated edit link (`/edit/abc`) crashed to "something broke · reload", a loop with no way home. Unknown paths got Next's unbranded 404. | 3 | 1 | **fixed**: not-found state, branded 404 with "drop a clip", "or start over" on the crash screen. `shots/edit-bad-link-before.jpg` |
| 10 | Phone editor header: the view switch overlapped "delete" ("boardelete"); stage, refusal and error lines were cut off (StatusDot is `nowrap`). | 3 | 1 | **fixed**: switch on its own row under 640 px; long lines wrap. `shots/phone-editor-cold-before.jpg` |
| 11 | Landing walkthrough (desktop 1440, ~97 % through "one take, start to finish"): a dark rectangle of the footage showed behind the finished circle. Chrome stops clipping composited children (playing video, soft-light cine layer) to an animated border-radius. | 3 | 1 | **fixed**: a no-op mask on the Lens frame forces the clip. `shots/walkthrough-circle-before.jpg` → `-after.jpg` |
| 12 | Upload failure (offline, server engine) ends at "upload failed · check your connection and drop it again", in the editor, where there's no drop. The file is still in the tab. | 3 | 2 | **fixed** (drop-flow PR): "try again" re-sends the file still held in the tab |
| 13 | Two drops in quick succession (or a drop while one is being read) started two projects. | 2 | 1 | **fixed**: one clip at a time on the landing (two back-to-back picks now add one edit) |
| 14 | `/pro/checkout` with an invalid link still said "you're in" above the error. | 2 | 1 | **fixed**: heading "pro", plus a "request access" link |
| 15 | The free limits (60 s, watermark) aren't said before the drop; the well says "the more ums the better · mp4, mov". People find the cap by being refused. | 3 | 1 | **left for the copy PR** (#34 owns site language): add "up to 60 s" to the well hint |
| 16 | "no take yet? try it with our clip" is hidden: `NEXT_PUBLIC_SAMPLE_CLIP_URL` isn't set. People without a take have no path to the value. | 4 | 1 (owner) | **left, owner**: host a 20 s sample (the spec's) and set the variable |
| 17 | Transcription on device (`base.en`) mishears: "Do not let a Jimbo see this" for "gym bro". Captions burn that in, and the thread shows it. Captions are editable (retype), but nothing invites it. | 3 | 3 | **left**: engine quality (consider `small.en` on capable devices); a hint that captions can be retyped |
| 18 | "your edits" on the landing: repeated drops of the same file look identical ("shoplink-ring-02 · ready" twice); failed and stuck edits sit there with no way to clear them from the list. | 2 | 2 | **left**: a relative time; a remove control |
| 19 | 320 px landing: a hero tile overlaps "about a minute · ums out · captions in…" | 2 | 2 | **left** (landing composition; the owner's clips). `shots/landing-320-overlap.jpg` |
| 20 | Export meta line "free export · watermarked · accounts aren't connected yet" reads like a status page to a stranger. | 2 | 1 | **left for the copy PR** |
| 21 | An edit link opened in another browser says "This edit isn't yours, or it doesn't exist." True (anonymous ownership), but creators will try to send their edit; there's no share or "open on your phone" path. | 3 | 4 | **left**: a share link (read-only theater view) is a product decision |
| 22 | The Lens with no clip (device edit after reload, before "choose it again") shows the design system's placeholder figure, which reads as someone else's footage. | 2 | 2 | **left** (design system): an empty Lens state |
| 23 | The model download counter could read "209 of 206 MB". | 1 | 1 | **fixed** |
| 24 | The landing has no dark theme (the editor has paper / night). | 1 | 3 | **left**: a choice, not a bug |
| 25 | The request-access form doesn't send the signed client hint, so its rate limit is per session only. | 1 | 1 | **left** for #29 (it adds the hint to the drop flow) |

## The conversion path, in one line each

- **Landing → drop:** short and clear: the well is the hero, on phones too (just above the fold at 390). Missing: the
  free limits before the drop (#15) and a path for people without a take (#16).
- **Drop → value:** with the model cached, 7 s to a ready edit with explained cuts and a raw/edit switch. First
  visit: 30 s of a progress line with nothing to watch (#6). Without WebGPU on production: never (#7).
- **Value → ask:** the ask now comes after the first download (#5), not before. The sign-up gate only runs with the
  `accounts` flag and a Clerk key (neither on dev).
- **After download:** the Pro line is the only next step. Worth adding: "edit another" (back to the well) and the
  share sheet on phones (spec step 6 mentions it; not built).

## Not exercised live (and why)

- Server path to "ready" and the server export: no worker on dev; CI's core-loop spec runs both with a real CPU worker.
- Clerk sign-up at export, the paywall, Stripe checkout: no keys on dev (the gate is code-read, flows.md §4).
- Rate limit: would mean 20+ throwaway projects on the shared dev backend; the message is code-read.
- A file over 200 MB: covered by the preflight unit test rather than a 200 MB upload to dev.

## Needs the owner


1. Production has no worker (#7): raise the Modal cap or decide what non-WebGPU browsers are told.
2. The sample clip (#16): host one and set `NEXT_PUBLIC_SAMPLE_CLIP_URL`.
3. The ready email (#3): set the SendPulse keys and turn on `ready_email` when it should be offered again.
4. A share link for edits (#21), and the phone layout for "ready" (#8).
