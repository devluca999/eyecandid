# Eyelore design system

**Eyelore** is a video editor for creators and UGC ads. Tagline: *cringe in, cinema out.*
The content is the interface: footage fills the screen, and UI appears only on hover, selection or right-click.

Sources: a written brief from the founder (Nov 2026), exact SVG vectors for the mark and small cut (pasted in chat), and the Eyelore prototype project ("Eyelore Screens") for look and feel — liquid glass, fanned takes, select-and-talk, style recipes, tldraw-style storyboard, Weave. Real names: projects **ShopLink** and **Everstock**; ads **wear it to bed**, **dresser glow-up**, **travel day** (ShopLink) and **ten-minute setup** (Everstock, the Sets demo).

## Principles
1. The content is the interface.
2. Three materials, nothing else.
3. Every track has an autopilot; you only handle the exceptions.
4. Polish how it was said, never what was said.
5. Make real people look great.

**Forbidden:** sidebars, stat cards, kanban columns, gradient washes, emoji, a border around every element, more than one accent colour.

## Content fundamentals
- **Short, plain, lowercase** in the UI: "ready", "rendering", "keep", "try again", "export", "needs you". Sentence fragments are fine; no exclamation marks.
- **Every automatic decision explains itself in one line**, written as `action · reason`: "cut away · you said 'nightstand'", "trimmed pause · 1.2s", "music ducked · you're talking".
- Address the user as **you**; the product never says "I" or "we" in the UI. Never use "AI" or "magic" in UI copy. Describe what was done.
- Buttons are verbs, one or two words. Placeholders are instructions: "say what to change…".
- Status is one lowercase word next to a 6px dot. Never use badges, banners or toasts with titles.
- No emoji, anywhere. No Title Case in the UI (the brand book's headings may use sentence case).
- Captions burned into video keep the speaker's words exactly. Polish delivery, never content.

## Visual foundations
- **Materials.** *Paper* is the canvas: warm off-white #F7F5F0, flat, optional very faint grain (`.el-grain`). *Glass* is **liquid**: it blurs, saturates and *refracts* what is behind it (an SVG displacement filter layered into `backdrop-filter` by `assets/eyelore.js` in Chromium; blur + saturate elsewhere), with a gradient rim (bright top, faint sides), a soft-light specular sheen and a soft layered shadow. Radius 16 (20 for prompt bubbles, 24 for sheets). *Chrome* is a 1px vertical gradient (#FFF → #C9CCD1 → #9EA3AA) that edges every video window and a few small controls. Don't add a fourth material.
- **Themes.** Paper is the default. Night (#0F0F10) is theater mode; the editor switches to Night automatically in theater and back to Paper for editing.
- **Colour.** The palette is near-monochrome ink on paper. The only colour is chrome-blue #5B7CFA, and it marks the **active selection only** (a 2px ring offset by 2px of canvas). Accent text is #3D5BD9 / #8EA4FF. Status dots: green #2F9E5F ready, accent for working (pulses), amber #D9822B for "needs attention". ink-tertiary is decoration and placeholders only.
- **Type — deliberately flat.** One display size (56/60, 500, −0.02em) for brand moments only. **15px is the primary UI size** (body 15/22, buttons 15/20 medium). Context menus and segmented controls are 13/18 medium. **12px is metadata only** (status words, timecodes, hints). Captions on video are 22/26 Bold white with a soft shadow. Geist Mono for timecodes and ratios; **Caveat** only for handwritten storyboard notes. Title/heading tokens exist for the brand book, not the product.
- **Footage.** Never stripes or grey boxes. Until real stills arrive, every video surface uses a photographic stand-in scene (`components/footage/scenes.css`, `Footage` component): **bed** (black ring on white sheets, morning window light), **nightstand** (walnut, warm lamp at night), **gym** (ring beside a blue dumbbell on grey rubber), **case** (dusty-rose velvet case on sunlit oak), **sofa** (creator selfie, string-light bokeh), **booth** (office booth), **void** (generated white set). Pass `image` to drop in a real still.
- **Ambient light.** Every Lens casts a soft, wide glow of its scene's colour onto the paper (`.el-lens::before`, strength `--ambient-strength`, lower on Night). Turn off only in dense grids (`.el-lens--noglow`).
- **Backgrounds.** No gradient washes, no illustrations, no patterns beyond the faint paper grain. The footage *is* the imagery: real creator video, warm and natural, never colour-graded toward blue.
- **Layout.** Centre the Lens on the canvas. Everything else (thread, export pill, explanation line) stacks below it, centred. Glass floats beside the selection. There are no fixed sidebars or toolbars. The top bar holds only the lockup, filename, a view switch and a theme toggle, and it sits on bare canvas.
- **Cards** are Lenses: 1px chrome edge with an inner top highlight, radius 20 (14 for cards, or circle), `lens-rest` shadow plus a 0.5px outer hairline so the chrome reads on Paper. Idea cards are raised paper with no border.
- **Borders.** Hairlines (#DAD6CD) appear only as separators inside menus and as the bead thread. Don't box elements.
- **Shadows.** `lens-rest` and `lens-lift` for video windows, `glass` (inset top highlight + 8/24 drop) for glass. Night uses deeper black shadows.
- **Radii.** Chip 6, menu item 10, glass panel 16, Lens 20, pill 999, circle 50%.
- **Motion.** Everything springs, and nothing eases linearly. Lens shape morphs use a ~450ms spring with slight overshoot (`--spring-morph`). Hover lifts 4px over 180ms. When something is selected, everything else recedes (blur 12px, opacity .4). Generating shows a slow diagonal shimmer (2.8s). The working dot pulses.
- **Hover.** Lenses lift and gain `lens-lift`. Pills rise 1px. Icon buttons get a 7% ink wash. Meta (timecode, status) fades in on the Lens.
- **Press.** Scale to .96 (buttons) or .92 (round send/export).
- **Focus.** A 2px accent outline, offset 2px.
- **Transparency & blur.** Use them only for glass over video and for recede. Never use translucent text.

## Iconography
- Line icons, **1.5px stroke, rounded caps and joins, 20px grid, never filled.** Size is 16px inside menus.
- **Substitution:** no Eyelore icon set was provided, so this system uses **Lucide** path data (ISC licence), copied programmatically into `components/icons/Icon.jsx` and the runtime `assets/eyelore.js` (`<i data-icon="mic"></i>`). It renders at 20px with a stroke of 1.8 units on Lucide's 24-unit grid, which is about 1.5px. Replace these if a bespoke set exists.
- Aspect-ratio glyphs are tiny 1.5px outline rectangles drawn at the true proportion (`RatioGlyph`).
- No emoji. Unicode is only used for `·` as the separator in explanations and `…` in placeholders.

## Logo
- `assets/logo/eyelore-mark.svg` / `-inverse.svg` (#F2F0EA): the flagship "2D" mark — exact vectors.
- `assets/logo/eyelore-mark-small.svg` / `-inverse.svg`: the small cut (2 sun rings, 3 ripples, heavier brow). Use below 48px wide and for every favicon and app icon.
- `assets/logo/favicon.svg` (switches with prefers-color-scheme), `eyelore-app-icon-paper.svg`, `eyelore-app-icon-night.svg` (chrome-edged tiles built from the small cut).
- Lockup (`.el-lockup`, `components/brand/Lockup`): lowercase "eyelore" in Geist Medium right of the mark. **Gap = 0.35× the mark's height** (the whole sun). Mark height ≈ 1.1× the wordmark x-height. Clear space = ripple-stack height on every side. Black or white only; never colour, outline, stretch or add effects.

## Index
- `styles.css`: the entry point (imports only). `assets/eyelore.js`: runtime — icons, liquid-glass filter, scene hooks. Load both on every page.
- `tokens/`: `fonts.css` (Geist, Geist Mono, Caveat — self-hosted), `colors.css` (Paper + `[data-theme="night"]`), `typography.css`, `layout.css`, `effects.css` (shadows, glass, springs, keyframes).
- `components/eyelore.css`: every component class (`.el-lens`, `.el-glass`, `.el-bead`, `.el-weave-win`…). `components/footage/scenes.css`: the seven scenes + grades.
- `components/` — each has `.jsx`, `.d.ts`, `.prompt.md` and a preview card:
  - Video: `footage/Footage`, `lens/Lens`, `selection/SelectionOverlay`, `prompt/PromptBubble`, `takes/TakeStack`, `takes/TakeMixer`, `captions/CaptionEditor`, `thread/BeadThread`, `broll/BrollSheet`, `weave/WeaveTrack`, `timeline/TimelineDrawer`, `drop/DropZone`, `effects/EffectAnchor`, `styles/StyleCard`.
  - Controls: `buttons/PillButton`, `menu/ContextMenu` (+ `lensMenu`, `RatioGlyph`), `add/AddMenu` (+ `GradeSwatches`), `dial/Dial`, `export/ExportPill`, `status/StatusDot`, `icons/Icon`.
  - Screens: `ideas/IdeaCard` (+ `GhostCard`), `ideas/TemplateRow`. Brand: `brand/Lockup`.
- `guidelines/`: foundation cards (Brand, Colors incl. liquid glass + ambient light, Type, Spacing, Motion).
- `ui_kits/editor/`: the full interactive editor — every feature reachable from it (see its README).
- `SKILL.md`: Agent Skill manifest.
