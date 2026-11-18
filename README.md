# Eyecandid

> Picking this up (agent or another account)? Read [`MANIFEST.md`](MANIFEST.md) first.

*Making real people look great.* (Formerly Eyelore.) A video editor for creators and UGC ads: drop in raw clips, get back a polished, captioned, well-paced edit in about a minute.

- Plan, data model, job contract, funnel, risks, milestones: [`PLAN.md`](PLAN.md)
- Decisions: [`docs/adr/`](docs/adr) · Brief: [`docs/BUILD_PROMPT.md`](docs/BUILD_PROMPT.md)

## Run it locally

```sh
pnpm install
pnpm convex:dev                         # local Convex backend (anonymous until `npx convex login`)
cp .env.example apps/web/.env.local     # NEXT_PUBLIC_CONVEX_URL=http://127.0.0.1:3210
pnpm --filter @eyelore/web dev          # http://localhost:3000, /hello runs the engine round-trip
```

Engine worker (CPU stub, talks to the local backend):

```sh
cd services/engine && uv venv --python 3.12 && uv pip install -e '.[dev]'
export EYELORE_CONVEX_SITE_URL=http://127.0.0.1:3211
export EYELORE_WORKER_TOKEN=$(npx convex run workers:register '{"name":"me","provider":"cpu-stub"}' | jq -r .token)
EYELORE_PROVIDER=cpu-stub .venv/bin/eyelore-worker
```

Mobile: `cd apps/mobile && npx expo start` with `EXPO_PUBLIC_CONVEX_URL` set (use your LAN IP for a device).

## Tests

`pnpm turbo run lint typecheck test` · `pnpm convex:test` · `cd services/engine && .venv/bin/pytest` · `pnpm --filter @eyelore/web e2e` (set `E2E_WORKER=1` with a worker running).
