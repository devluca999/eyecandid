# 0011 · Product renamed to Eyecandid; internal names stay eyelore for now

**Status:** accepted · 2026-11-17

**Context.** The product is now **Eyecandid** (domain eyecandid.co). The tagline is unchanged: *Making real people look great.*, with "From cringe to cinema" as a secondary playful line. Renaming every internal identifier at once would touch packages, environment variables, infrastructure and data that live users already depend on, for no user-visible gain.

**Decision.** Rename everything a person sees; keep internal identifiers as `eyelore` until a later ADR moves them deliberately.

Changed (user-facing):
- Web: page title, `applicationName`, OpenGraph and Twitter metadata, the lockup wordmark (`eyecandid`, set exactly as `eyelore` was: same font, weight and spacing; the eye mark from `brand/` is unchanged), the lockup's alt text, the funnel page title and home link label, the export download filename (`eyecandid.mp4`).
- Render: the free-tier watermark reads `eyecandid`.
- Email: the "your edit is ready" sender name is "Eyecandid".
- Mobile: the app display name, the camera/microphone/photo permission strings, the capture screen copy, the mark's accessibility label, the exported file name.
- Docs: README headline, CLAUDE.md, PLAN.md, docs/product-notes.md.
- The GitHub repository was renamed to `devluca999/eyecandid` by the owner (old URLs redirect).

Not changed (internal, on purpose):
- Package names `@eyelore/*`, the Python package `eyelore_engine`, environment variables `EYELORE_*`, the `x-eyelore-wake` header.
- The Convex project, the Vercel project, the Modal apps (`eyelore-worker`, `eyelore-worker-prod`), the GHCR image name.
- Brand file names `brand/eyelore-mark*.svg` (the vectors themselves are the product mark and stay exact).
- Browser storage keys (`eyelore.anonId`, `eyelore.tour.v1`, `eyelore.funnelToken`): renaming them would orphan every anonymous session and its edits.
- The mobile `slug`, URL `scheme` (`eyelore://`), iOS `bundleIdentifier` and Android `package` (`app.eyelore`): changing those makes a different app to the stores and breaks over-the-air updates for existing installs. Revisit before the first store submission.
- Test fixtures' fake domains (`eyelore.test`).

**Consequences.** Users see one name everywhere. Developers see `eyelore` in code and infrastructure; this ADR is the map. A future rename of internals needs its own ADR with a migration for storage keys and a store-identity decision for mobile.
