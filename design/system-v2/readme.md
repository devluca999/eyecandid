# Eyecandid Design System

**Eyecandid** is an AI video editor for creators and UGC ads. Tagline: **"Making real people look great."** Playful secondary line: **"From cringe to cinema."**

Drop in raw, awkward clips — real phone footage or AI-generated — and get back a polished, captioned, well-paced edit in about a minute.

## Products
- **Web editor** (desktop) — library, the Lens editor (edit · card · theater), timeline drawer, export. → `ui_kits/web-editor/`
- **Mobile app** (native) — ideas, capture with teleprompter, pick a take, light edit, export. → `ui_kits/mobile/`
- **Landing page** (marketing) — hero with live drop zone, proof reel, scroll sequence, founder letter, pricing, FAQ. → `ui_kits/landing/`

## Sources
This system was built from a written brief (company description, tokens, component list, voice and principles) plus three logo files supplied by the user: `uploads/eyecandid-mark.svg`, `uploads/eyecandid-mark-inverse.svg`, `uploads/eyecandid-mark-small.svg` (copied to `assets/`). No codebase, Figma file or screenshots were provided, so UI kits are **interpretations of the brief**, not recreations of shipped screens.

## Principles
1. **The content is the interface.** Footage fills the screen; UI appears only on hover, selection or right-click.
2. **Three materials, nothing else** — Paper, Glass, Chrome.
3. **Every track has an autopilot**; the user only handles exceptions.
4. **Polish how it was said, never what was said.**
5. **Make real people look great.**

**Forbidden:** sidebars, stat cards, kanban columns, gradient washes, emoji, a border around every element, more than one accent colour, text below 12px.

---

## CONTENT FUNDAMENTALS

**Product UI voice — short, plain, lowercase.**
- Buttons and labels are lowercase verbs or nouns: `keep`, `try again`, `export`, `share`, `film this`, `see all`, `library`.
- Status is one lowercase word: `ready`, `working`, `exporting`, `captioning`, `1 to check`.
- **Every automatic decision explains itself in one line**, using ` · ` as the separator: `cut away · you said ‘nightstand’`, `removed 2 fillers · 1 pause · 1.8s`, `best take · steadiest voice · no ums`, `autopilot used the first · swap anytime`.
- Address the user as **you**, implicitly; Eyecandid speaks as **we** only in marketing ("We find the good parts"). In-product, Eyecandid barely speaks — it reports.
- Quote the user's own words back with curly single quotes: ‘nightstand’.
- Never rewrite what someone said. Copy about edits says *trimmed, removed, fixed spelling, kept* — never *improved your script*.
- No exclamation marks in UI. No emoji, anywhere.

**Marketing voice — playful, self-aware, then earnest.**
- Sentence case headlines with a full stop: "From cringe to cinema." "Same people. Same phones. Better takes." "Cheaper than a reshoot."
- Honest about how weird filming yourself is: "Filming yourself is weird. Watching it back is worse." "Three takes, two ums, one long look at the ceiling. Normal."
- The **founder letter** drops the jokes: first person, specific, warm ("I made my first product video in a parked car, on the fourth try…").
- **No invented social proof.** No fake quotes, metrics or creator handles anywhere. The proof slot is a labelled placeholder ("proof goes here: real creators after launch") until real, consented creator proof exists.
- **Line hierarchy:** the H1 is always the tagline **"Making real people look great."** "From cringe to cinema." is a secondary playful line (scroll sequence, footer) — never the H1.

**Formatting:** times in Geist Mono (`00:14.32`, `0:31`, `9:16 · 1080p`). Aspect ratios written `9:16`, never "9x16".

---

## VISUAL FOUNDATIONS

**Overall vibe.** A quiet, warm, paper-white studio where footage is the only colourful thing. Black-and-white brand, one chrome-blue accent for selection, generous space, soft light. It should feel like looking at prints on a desk, not operating software.

**Colour.** Two themes: **Paper** (default) and **Night** (theater mode switches automatically). Neutrals are warm (canvas `#F7F5F0`, ink `#111111`). The **only accent is chrome-blue `#5B7CFA`**, and it means *selected* — a 2px ring offset by 2px of canvas, a checked menu row, the active caption word. Never a button fill, never decoration. Accent text uses `#3D5BD9` (paper) / `#8EA4FF` (night). Status colours (ready `#2F9E5F`, working = accent, attention `#D9822B`) appear only as a 6px dot or a single word. Caption ink is always white. See `tokens/colors.css`.

**Type.** Geist for everything, Geist Mono only for time, frames and dimensions. Scale: display 56/60 500 −0.02em · title 28/34 500 · heading 20/26 500 · body 15/22 400 (primary UI) · ui 13/18 500 · meta 12/16 400. **Nothing below 12px.** Burned-in captions 22/26 700 white with a soft two-layer shadow. Marketing display scales fluidly up to ~72px with tighter tracking (−0.03em).

**Materials — only three.**
- **Paper** — the canvas: warm off-white with a faint fractal grain (`.el-paper`, `--grain`). Everything sits on paper.
- **Glass** — frosted translucent panels (`--glass-fill`, `blur(28px) saturate(1.6)`), a 1px bright edge, inset top highlight and soft shadow (`--shadow-glass`). **Only for things floating over footage**: prompt bubble, menus, drawer, take label, export pill, teleprompter.
- **Chrome** — a 1px hairline gradient `#FFFFFF › #C9CCD1 › #9EA3AA` on every Lens and a few small controls (Dial rim). Never on text or panels.

**The Lens.** The core object — one video window that springs between a **theater circle**, an **edit rectangle** at the true aspect ratio (radius 20), and a **9:16 storyboard card**. It carries the chrome hairline, `lens-rest` shadow, and an **ambient glow of its footage colour** blurred onto the paper beneath it.

**Backgrounds & imagery.** No gradient washes, no patterns, no illustrations. The only imagery is footage — warm, natural-light, slightly soft, real-life (bedrooms, nightstands, gym floors, dressers, creators under string lights). Footage gets faint grain. Use real stills via `<Footage image>` whenever available; built-in scenes are placeholders.

**Spacing.** 2 · 4 · 8 · 12 · 16 · 24 · 32 · 48 · 64 · 96. Layouts are centred and airy; the Lens is the focal point with ≥48px of paper around it.

**Corner radii.** chip 6 · menu item 10 · glass panel 16 · Lens 20 · pill 999 · circle 50%. Buttons are always pills.

**Shadows.** `lens-rest` (0 1 2 / 0 12 32 at 8–10%), `lens-lift` (0 2 4 / 0 24 56 at 10–16%), `glass` (inset top highlight + 0 8 24). Night uses deeper black equivalents. No inner shadows except the sunken DropZone well and kbd chips.

**Borders.** Almost none. Separation comes from material and shadow. Hairlines (`--hairline`) are allowed for list dividers (FAQ, footer), the BeadThread/track thread, and the edit-screen tool row. Never box every element.

**Cards.** There are no generic cards — every "card" is a Lens (footage, radius 20, chrome hairline, glow). The only non-Lens raised surface is the featured pricing tier (white, radius 20, `lens-rest`).

**Motion.** Everything springs. Lens morph ~450ms (`--spring` = cubic-bezier(.34,1.36,.64,1)); hover lift 4px over 260ms; drawers and accordions use `--spring-soft`. **Selection recedes the background**: `blur(12px)` + opacity .4 on everything that isn't selected. **Generating** = footage blurred + a slow diagonal shimmer (2.8s linear). Working status dots pulse. No fades-from-nothing on core content; things move into place.

**Hover / press.** Hover: Lens lifts 4px and its glow brightens; quiet buttons gain a 7% ink tint; primary darkens slightly. Press: scale .96 with spring return. Focus: 2px canvas + 2px accent ring.

**Transparency & blur.** Only glass panels and the select-recede. Protection for text over footage is a soft top scrim (IdeaCard) or the caption shadow — never a capsule unless it's a glass chip.

**Layout rules.** No sidebars. Fixed elements are minimal: a 72px top bar (back, title, status, mode switch, export pill), a single "+" bottom-left, and a "timeline" toggle bottom-right. The timeline is a drawer, hidden until asked for. In theater mode the chrome fades away.

---

## ICONOGRAPHY

- **Set:** [Lucide](https://lucide.dev) (ISC licence) — 79 icons copied into `assets/icons/*.svg` (v0.460.0) and inlined into the `Icon` component (`components/core/iconData.js`). Lucide was chosen as the closest open set to the brief: line icons with rounded caps and joins. **Flag:** no proprietary Eyecandid icon set was supplied — this is a substitution.
- **Style:** 1.5px stroke at 20px (the component scales Lucide's 24-grid stroke so it renders 1.5px at 20px), rounded caps, **never filled**, `currentColor`.
- **Usage:** `<Icon name="scissors" />`. Sizes 16 (dense menus), 18 (menus/buttons), 20 (default), 22–24 (drop well).
- **Aspect-ratio glyphs** are drawn proportionally by `AspectGlyph` (ContextMenu) — a rounded rectangle outline at the true ratio.
- **No emoji. No unicode symbols as icons**, except keyboard glyphs in shortcut chips (⌘ ⌫) and the ` · ` separator in copy.
- **Logo:** use the supplied SVGs exactly (see Brand below). Never redraw.

## BRAND / LOGO
- `assets/eyecandid-mark.svg` — flagship mark (calligraphic almond eye, ringed sun half-sunk on the horizon, tapering ripple bars, fine brow).
- `assets/eyecandid-mark-inverse.svg` — for dark grounds.
- `assets/eyecandid-mark-small.svg` — below 48px, favicons, app icons.
- Wordmark: lowercase **eyecandid** in Geist Medium to the right of the mark; gap = 0.35× mark height; clear space = the ripple stack's height. Black or white only — never colour, outline or effects. Use `<Logo wordmark />`.

---

## Fonts
Geist and Geist Mono (SIL OFL) are self-hosted as variable latin subsets in `fonts/`, downloaded from Google Fonts. **If you have official Geist files (e.g. from Vercel's package with full glyph coverage), drop them into `fonts/` and update `tokens/fonts.css`.**

---

## Index

**Root**
- `styles.css` — entry point (imports only)
- `tokens/` — `fonts.css`, `colors.css` (paper + night), `typography.css`, `spacing.css` (spacing, radii, hit sizes), `effects.css` (shadows, glass blur, grain, springs), `base.css` (body reset, `.el-paper` / `.el-glass` / `.el-chrome` helpers, keyframes)
- `assets/` — logos, `icons/`
- `fonts/` — Geist, Geist Mono
- `guidelines/` — foundation specimen cards; `guidelines/cards/` — per-component showcase cards
- `ui_kits/` — `web-editor/`, `mobile/`, `landing/`
- `SKILL.md` — Agent Skill entry

## Components
All exported on the bundle namespace (`window.EyeloreDesignSystem_65a209`).

**core/** — `Button` (primary ink · secondary glass · quiet; 44/52px), `Icon`, `StatusDot`, `Glass`, `Logo`
**lens/** — `Lens` (circle · edit · card; rest · hover · selected · generating; export ring), `Footage` (5 scenes, grades, image prop)
**editing/** — `PromptBubble` (select-and-talk), `ContextMenu` (+ `AspectGlyph`, aspect submenu), `BeadThread`, `TakeStack`, `CaptionEditor`, `AddMenu`, `BrollSheet`, `ShortcutSheet`
**timeline/** — `TimelineDrawer` (video, b-roll, voice, music, captions — fixed order), `WeaveTrack`, `Dial`, `ExportPill`
**create/** — `DropZone`, `GenreSwitcher` (comedy, horror, thriller, action, romance, documentary), `IdeaCard`, `TemplateRow`, `StyleCard`
**marketing/** — `Hero` (live drop zone), `LensReel`, `ScrollSequence` (scroll-sequence frame), `FounderLetter` (PLACEHOLDER copy · founder: Luca), `Marquee` (labelled social-proof placeholder), `PricingTable` (monthly/yearly + student · PLACEHOLDER prices), `FAQ`, `Footer`

### Intentional additions
- `Glass` — material primitive so consumers don't hand-roll the glass recipe.
- `Logo` — enforces the mark/wordmark lockup rules.
- `Icon` — wrapper for the Lucide subset at the brand stroke weight.
- `AspectGlyph` — exported from ContextMenu for reuse in export/format pickers.

## UI kits
- `ui_kits/web-editor/index.html` — library → editor. Click the Lens to select (PromptBubble), right-click for ContextMenu (takes, b-roll, captions, aspect ratio), keys 1/2/3 switch edit · card · theater, ⌘E timeline, ? shortcuts, export runs the ring.
- `ui_kits/mobile/index.html` — ideas → capture (teleprompter, record) → takes → light edit (tap Lens to talk, genre sheet) → export.
- `ui_kits/landing/index.html` — full landing page.
