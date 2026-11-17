# Landing v2 inventory

Source: `Eyecandid Landing v2.dc.html` (58,830 bytes, 579 lines). A Claude Design "dc" page: `<x-dc>` markup, with logic in a `<script type="text/x-dc" data-dc-script>` block (`class Component extends DCLogic`, React-style `renderVals()`), run by `support.js`. Title: "eyecandid · making real people look great". Components come from the global `EyeloreDesignSystem_65a209` (Lens, Logo, Button, DropZone, Glass, StatusDot, WeaveTrack, PromptBubble, FounderLetter, Marquee, PricingTable, FAQ, Footer). Their sources are in `design/system-v2/components/`. The page links the design system through `_ds/eyelore-design-system-65a2090c-.../` (tokens/*.css, styles.css, _ds_bundle.js). That copy was not exported; `_ds_bundle.js` is generated and was skipped on purpose.

All copy that appears in the page is quoted verbatim below. Component-internal copy (pricing tiers, footer links, founder letter body) lives in the design-system components, not in this file, except where passed as props.

## (a) Sections in page order

Nav (hero, 72px): logo wordmark (`Logo`, `base-path="assets/"`), links "how it works" (#how), "pricing" (#pricing, desktop only), button "drop a clip".

1. **01 hero**
   - Eyebrow: "ai video editor for creators and ugc ads"
   - H1: "Making real people look great."
   - Sub: "Drop the awkward take. Get back the one you’d actually post."
   - DropZone title "drop your rawest clip", hint "the more ums the better · mp4, mov"
   - Meta: "about a minute · ums out · captions in · your words stay yours"
   - Behind the copy: scattered Lens tiles (video) at several depths, plus a canvas-coloured radial scrim.
2. **02 reel** (`#how`, media left, copy right)
   - Eyebrow: "the reel"
   - H2: "Same people. Same phones. Better takes."
   - Body: "Every edit here has a raw take underneath. Hover one to see it. We’re not proud of it either."
   - Meta: "demo edits on stock footage"
   - Four tiles. Edit caption / raw caption, edit label / raw label:
     - a: "okay. three drops. that’s it." / "okay so um… three, three drops"; "edit · 0:24" / "raw · take 4"
     - b: "it lives on my nightstand" / "so it, uh… lives on my"; "edit · 0:31" / "raw · take 2"
     - c: "and it comes in this" / "and it, wait, hold on"; no label
     - d: no caption; "b-roll · graded" / "raw · shaky"
3. **03 cringe to cinema** (copy left, pinned media right, 560vh tall)
   - Eyebrow (desktop only): "one take, start to finish"
   - Seven steps, each with a title, a body and a chip:
     1. "You film it. Awkwardly." / "Three takes, two ums, one long look at the ceiling. Normal." / chip "raw · take 3 · 2 ums"
     2. "We cut the ums." / "Fillers and dead air come out. Every cut says why, so you can put any of it back." / chip "removed 2 fillers · 1 pause · 1.8s"
     3. "We say it back, clearly." / "Word-timed captions, spelled right. We polish how you said it, never what you said." / chip "captions · word-timed"
     4. "We weave in the b-roll." / "You said ‘nightstand’, so we cut to the nightstand." / chip "cut away · you said ‘nightstand’"
     5. "We fix the light." / "One grade across every clip, so your face and the b-roll share the same afternoon." / chip "grade · warm afternoon"
     6. "We find the beat." / "Music under your voice. It ducks when you talk and comes back up on the cut." / chip "music ducks under your voice"
     7. "From cringe to cinema." / "Cut, captioned, woven, graded, scored. About a minute." / chip "ready · 0:31"
   - Also: a `WeaveTrack` (kind music, 31s duration) under the tile that fades in from step 6.
4. **04 genre switcher** (media left, copy right)
   - Eyebrow: "genre switcher"
   - H2: "Same words. Different movie."
   - Body: "Flip the genre and the same clip re-grades, re-paces and re-scores itself. Not one word changes. The laugh track is a choice."
   - Buttons: "comedy", "horror", "thriller", "sports ad"
   - Meta line per genre:
     - comedy: "bright · snappy cuts · a laugh after every line" (cue "[laugh track]")
     - horror: "cold · slow push-in · the nightstand is suspicious now" (cue "[a door creaks somewhere]")
     - thriller: "teal · tight cuts · someone knows about the nightstand" (cue "[heartbeat, getting louder]")
     - sports: "same words · now it’s a shoe ad" (cue "[crowd goes wild]")
5. **05 autopilots** (copy left, media right via row-reverse)
   - Eyebrow: "autopilots"
   - H2: "Every track drives itself."
   - Body: "Five tracks, five autopilots. You only step in when one raises its hand. Or point at the thing and say what you want."
   - Track rows (name / why / status word):
     - video: "best take · steadiest voice · no ums" / ready
     - b-roll: "cut away · you said ‘nightstand’" / "1 to check"
     - voice: "removed 2 fillers · 1 pause · 1.8s" / ready
     - music: "ducks under your voice · back up on the cut" / ready
     - captions: "word-timed · spelled right · your words" / captioning
   - PromptBubble: context "selected · background", placeholder "what should change?", auto-typed "make the background space", chips ["warmer", "tighter", "cut the ums"], replies "working on ‘…’" and "done · … · you stay exactly as you were".
   - Meta: "select-and-talk · type your own"
6. **06 real and ai** (media left, copy right)
   - Eyebrow: "real or ai"
   - H2: "Phone or prompt. Same polish."
   - Body: "Real footage and AI footage go through the same edit, on the same timeline. Same captions, same grade, same pacing. No favourites."
   - Tile labels: "real", "ai". Tile captions: "yes, even at the gym", "every single morning"
   - Meta: "hover to see both raw · stock clip stands in for ai" (mobile: "tap …"); while raw: "raw · both of them · equally unbothered"
7. **07 founder letter**: `FounderLetter` with `name="[founder name]"`, `role="founder, eyecandid"` (placeholder name). Two decorative drifting tiles on desktop.
8. **08 proof placeholder**: `Marquee`, label "proof goes here: real creators and their real clips, after launch, with consent"
9. **09 pricing**: `PricingTable`; its `on-choose` scrolls to the final drop. One drifting tile on desktop.
10. **10 faq**: `FAQ`, title "Fair questions."
    - "do I need to be good on camera?" / "No. That’s sort of the point. Film it the way you’d film it, and we handle the pauses, the ums and the shaky start."
    - "will it change what I said?" / "Never. We trim, caption and fix spelling. Your words stay your words, even in horror mode."
    - "does it work with AI footage?" / "Yes. Real and AI clips get the same edit, side by side on one timeline."
    - "what does autopilot actually decide?" / "Takes, cuts, b-roll, music, captions and the grade. Every decision says why in one line, and you can undo any of it."
    - "what can I export?" / "mp4 at 9:16, 1:1, 4:5 or 16:9."
    - "is the pricing final?" / "Not yet. Anything on this page marked placeholder is exactly that."
11. **11 final drop**
    - H2: "Go film the awkward one."
    - Sub: "We’ll take it from there."
    - DropZone "drop your rawest clip", hint "about a minute · mp4, mov"
12. **12 footer**: `Footer` (`asset-base="assets/"`).

Fixed overlays:
- Bottom pill (Glass): "got an awkward take?" plus a "drop a clip" button. It shows once the hero has scrolled past and hides while the final section is in view.
- Top toast: "reading {file} · finding the good parts", then "{file} · your edit is waiting".
- Hidden `<input type=file accept="video/*" multiple>`. It only drives the demo toast; there is no upload or backend call.

## (b) External media URLs

The page has no hard-coded media URLs. Every `<video data-clip="ID">` gets its source from this template in the script:

`https://assets.mixkit.co/videos/${id}/${id}-${q}.mp4`

It tries `q=720`, then `360`. If the tile has `data-fb`, it then tries the fallback id at 720, then 360. Videos are muted, looped, `playsinline`, `preload=metadata`. There are no `<img>` or other external URLs. Fonts come from the design system's local woff2 files.

| Mixkit id | Used in sections |
|---|---|
| 5565 | hero (far blurred circle); 07 founder letter (drift circle) |
| 41272 | hero (blurred card); 02 reel tile a; 05 autopilots talking-head tile |
| 42308 | hero (blurred edit tile); 02 reel tile b; 06 real tile |
| 32800 (fallback 588, `data-start=0.05`) | hero (runner card); 04 genre "sports" tile; 11 final drift card |
| 9582 | hero (cine tile) |
| 236 | hero (b-roll tile); 03 sequence b-roll layer; 11 final drift tile |
| 40865 (fallback 40864) | hero (lower right); 04 genre sports cyclist inset |
| 42323 | hero (small circle); 03 sequence base clip; 04 genre base clip and pip circle |
| 810 | hero (small tile); 02 reel tile d; 07 founder drift tile |
| 41181 | hero (circle); 02 reel tile c; 10 faq drift circle |
| 46653 | 06 "ai" tile |
| 583 | 09 pricing drift card |

Mixkit titles and licence terms were not checked; only the ids are in the page. The "ai" tile is a stock clip standing in for AI footage (the page says so).

## (c) Not in `design/system-v2/tokens`

CSS variables: every `var(--…)` the page uses is defined in system-v2 tokens (`--accent-text`, `--canvas`, `--caption-shadow`, `--dur-lift`, `--dur-morph`, `--dur-quick`, `--ease-out`, `--font-sans`, `--grain`, `--hairline`, `--ink`, `--ink-secondary`, `--shadow-lens-lift`, `--spring`, `--spring-soft`, `--type-body`, `--type-caption`, `--type-display`, `--type-meta`, `--type-title`, `--type-ui`). The page defines no new custom properties. `--spring-soft` is used with a fallback, `var(--spring-soft, cubic-bezier(.2,.9,.3,1))`.

Fonts: only `var(--font-sans)` (Geist). No other font families.

Hard-coded values, not tokens:
- `@keyframes el-grain`, defined on the page. The tokens' base.css only has el-shimmer, el-marquee, el-pulse and el-drift.
- Placeholder backgrounds behind videos: `#1a1714`, `#14110f`.
- Caption text `#fff`.
- Grain overlay tints: `rgba(120,100,70,.018)` and `rgba(120,100,70,.014)` (hairline stripes, `repeating-linear-gradient` at 97deg and 8deg); vignette `rgba(90,70,40,.10)`.
- Cinematic grade overlay: `linear-gradient(180deg, rgba(255,176,96,.22), rgba(18,96,110,.28))` with `mix-blend-mode: soft-light`.
- Space-background overlay in section 05: a night-blue linear gradient starting `rgba(14,18,48,.75)` plus `#fff` star dots (radial-gradients). The line was truncated in my read, so the full values are in the source file.
- Video filter strings (JS constants):
  - RAW `saturate(.62) contrast(.84) brightness(.96)`
  - WARM `saturate(.9) contrast(1.04) brightness(1.03) sepia(.12)`
  - CINE `contrast(1.24) brightness(.9) saturate(.92) sepia(.16)`
  - comedy `saturate(1.4) brightness(1.1) contrast(1.04)`
  - horror `grayscale(.75) contrast(1.45) brightness(.62) sepia(.25) hue-rotate(150deg)`
  - thriller `saturate(.55) contrast(1.3) brightness(.82) hue-rotate(-12deg)`
  - space `saturate(.8) contrast(1.15) brightness(.86) hue-rotate(-14deg)`
  - various per-tile hero filters
- Inline `clamp()` type sizes (H1 `clamp(42px,6.2vw,84px)`, H2 `clamp(30px,3.6vw,48px)`, final H2 `clamp(38px,5vw,64px)`) and letter-spacing (-0.035em, -0.025em, -0.03em). These override the token sizes.
- Breakpoints in JS: mobile is `innerWidth < 760`, narrow is `< 1180`.

## (d) Animations and scroll effects

- **Grain:** a fixed full-viewport overlay (z-index 60, pointer-events none). Layer 1 is `var(--grain)` at opacity .22, `mix-blend-mode: multiply`, inset -10%, animated with `el-grain .9s steps(5) infinite` (translate jitter). Layers 2 and 3 are the static paper stripes and a vignette. `document.body` gets class `el-paper`.
- **Hero parallax and mouse tracking:** a `requestAnimationFrame` loop eases mouse position (factor 0.05). Each `[data-depth]` element gets `translate3d(-cx*36*d px, -cy*28*d - scrollY*0.22*d px, 0)`. It only runs while `scrollY < 1.5 * viewport height`. Depths run from 0.25 to 1.2; far tiles are blurred and faded. Mobile hides the desktop-only tiles (`sc-if desktop`).
- **Drift tiles:** `[data-drift]` elements in the founder, pricing, faq and final sections. In the same rAF loop, translateY is `(elementCenter - viewportCenter) * -d` with d between 0.1 and 0.2, and translateX follows the mouse at -cx*20. Skipped when the parent is more than 200px off screen.
- **Pinned scroll sequence (section 03):** the section is 560vh tall with a `position: sticky; top: 0; height: 100vh` child. On scroll, progress `p = clamp(-rect.top / (height - innerHeight), 0, .999)` and `step = floor(p * 7)`. Step drives, via state:
  - the Lens shape: card (steps 0-1), edit (2-5), circle (6)
  - the video filter: RAW, then a mid grade, then WARM, then CINE
  - the b-roll layer opacity (step 3 only)
  - the cine overlay (step 6 only)
  - the music track visibility (step 5 and up)
  - Lens state "generating" at step 1
  - the chip text and StatusDot status
  - copy list emphasis: the active item is larger with its body shown; earlier items are at .32 opacity and later ones at .5; on mobile only the active item displays
  - a tilt at step 0
  
  Transitions use `--spring`, `--dur-lift`, `--dur-morph` and `--ease-out`.
- **Reveal on scroll:** `[data-reveal]` elements below 90% of the viewport start at `translateY(56px)`, opacity .35, then an IntersectionObserver (rootMargin bottom -12%) sets them to none and 1. Transition .9s spring-soft and .6s ease-out.
- **Video play/pause:** an IntersectionObserver (rootMargin 200px) plays videos in view and pauses the rest. A MutationObserver re-runs the wiring when the DOM changes. The same wiring also rewrites text and alt "eyelore" to "eyecandid".
- **Reel hover:** hovering a tile (tap toggles on mobile) swaps the filter WARM to RAW, the caption to the raw text and the label to the raw label, with a .5s filter transition.
- **Genre switcher:** a 2.6s `setInterval` cycles comedy, horror, thriller and sports while the section is on screen and `genreAuto` is on. Clicking a button stops the auto-cycling. Each genre changes the filter, scene and meta line. Sports crossfades to the 32800 clip and shows a pip circle and a cyclist inset.
- **Prompt demo:** a timed loop types "make the background space" (about 55-105ms per character, 1.2s initial delay), submits, shows "working" for 1.9s, then "done", then restarts after 4.5s. The Lens state switches to "generating" and the filter changes to blur and then the space grade. User typing or submitting stops the loop.
- **Real/AI pair:** hover (tap toggles on mobile) switches both tiles to RAW and hides their captions.
- **Floating pill and toast:** the pill slides up once the hero is past 80px from the top, and hides when the final section enters view or the toast shows. The toast slides in from the top when a clip is dropped or picked. The states cycle "working" (2.8s), "ready" (until 7s), then idle.
- No WebGL, canvas or scroll library. Everything is DOM, inline styles, CSS transitions and one rAF loop.

## Mobile page: `Eyecandid Landing Mobile.dc.html` (1,632 bytes)

It contains no content of its own. It is a preview wrapper: it loads the same design-system tokens and `support.js`, then renders a 390 x 844 rounded frame (radius 44px, `--shadow-lens-lift` plus a hairline) containing an `<iframe src="Eyecandid Landing v2.dc.html">`, with the caption "mobile · 390 × 844 · scroll inside". The mobile layout comes from the desktop page's own `mobile` state (`window.innerWidth < 760`), which the 390px iframe triggers. That state shrinks the hero tiles, hides the desktop-only tiles, stacks the pinned sequence as a column that shows only the active step, and switches hover interactions to tap. It also loads `_ds_bundle.js` and sets `body{background:var(--canvas)}`. No media URLs, fonts or colours beyond the page's tokens.

## Notes

- `assets/eyelore-mark*.svg` here are reference only. The product's marks are in `brand/`. The page itself references `assets/` via the Logo and Footer components (`base-path` / `asset-base`).
- Brand name: the design system still says "eyelore". The page rewrites it to "eyecandid" at runtime (text nodes and img alt).
