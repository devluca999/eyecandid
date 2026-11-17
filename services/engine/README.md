# eyelore-engine

The pull-based worker. It calls the Convex worker API over HTTPS (outbound only) and runs jobs from the contract in
`packages/core` (validated against `packages/core/schema/jobs.schema.json`). Same code on every host; only
`EYELORE_PROVIDER` differs.

| env | meaning |
|---|---|
| `EYELORE_CONVEX_SITE_URL` | `https://<deployment>.convex.site` |
| `EYELORE_WORKER_TOKEN` | from `npx convex run workers:register '{"name":"…","provider":"…"}'` (shown once) |
| `EYELORE_PROVIDER` | `cpu-stub` (tests) · `cpu` · `modal` · `colab` · `runpod` |
| `EYELORE_TRANSCRIBE_MODEL` | optional cap, e.g. `base` |

**Local:** `uv venv --python 3.12 && uv pip install -e '.[cpu]' && .venv/bin/eyelore-worker` (needs ffmpeg; render also
needs Node and the repo's `services/render`).

**Modal (scale to zero, woken by Convex):** `uvx --from modal modal deploy services/engine/deploy/modal_app.py` (add
`EYELORE_ENV=prod` for production) with a Modal secret `eyelore-worker` / `eyelore-worker-prod` holding the two env
vars above. Then set the printed `wake` URL on the Convex deployment: `npx convex env set EYELORE_WAKE_URL <url>`.
A worker starts when a job is waiting and leaves after 3 idle minutes (ADR 0010).

**Colab:** `!pip install <wheel from the GitHub release>` then set the env vars from Colab secrets and run
`!EYELORE_PROVIDER=colab eyelore-worker`.

**RunPod / any GPU host:** run `ghcr.io/devluca999/eyelore-engine:main` with the env vars set.
