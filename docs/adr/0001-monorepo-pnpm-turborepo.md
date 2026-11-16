# 0001 · Monorepo with pnpm and Turborepo

**Status:** accepted · 2026-11-15

**Context.** Web, mobile, a shared backend, shared types and design tokens must move together; a change to the edit model has to break both clients' typecheck in the same PR.

**Decision.** One pnpm workspace (`apps/*`, `packages/*`, `services/render`) orchestrated by Turborepo. `convex/` lives at the root so both apps import one generated API. The Python engine (`services/engine`) is outside the JS workspace with its own `pyproject.toml`, wired into Turbo only through CI.

**Consequences.** One lockfile, cached tasks, atomic cross-package changes. Expo's Metro wants hoisted packages: `nodeLinker: hoisted` in `pnpm-workspace.yaml` (pnpm 12 ignores `.npmrc` for this). One React version (19.3.0, Expo's pin) across the workspace.

**Mobile styling.** React Native uses `StyleSheet` with the tokens generated into `packages/ui` rather than NativeWind: NativeWind 4 still requires Tailwind 3 while the web is on Tailwind 4, and generated tokens keep both platforms on one source.
