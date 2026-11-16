# Eyelore engine worker (CUDA). Same image on Modal, RunPod or any GPU host; pulls jobs over HTTPS (outbound only).
# Contains the Python worker, ffmpeg, and the Remotion renderer (Node + services/render + Chrome headless shell).

# ── renderer: install only what services/render needs from the workspace ──
FROM node:22-bookworm-slim AS render
RUN corepack enable && corepack prepare pnpm@12.14.0 --activate
WORKDIR /repo
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./
COPY packages/core ./packages/core
COPY services/render ./services/render
RUN pnpm install --frozen-lockfile --filter @eyelore/render... \
 && cd services/render && npx remotion browser ensure

# ── worker ──
FROM nvidia/cuda:12.6.3-cudnn-runtime-ubuntu24.04
ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1
RUN apt-get update && apt-get install -y --no-install-recommends python3.12 python3.12-venv ffmpeg git curl ca-certificates \
      libnss3 libdbus-1-3 libatk1.0-0 libgbm1 libasound2t64 libxrandr2 libxkbcommon0 libxfixes3 libxcomposite1 libxdamage1 libatk-bridge2.0-0 libcups2 libpango-1.0-0 libcairo2 \
 && curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && apt-get install -y --no-install-recommends nodejs \
 && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /usr/local/bin/uv
COPY --from=render /repo /repo
WORKDIR /app
COPY services/engine/pyproject.toml services/engine/README.md* ./
COPY services/engine/eyelore_engine ./eyelore_engine
COPY packages/core/schema/jobs.schema.json ./eyelore_engine/jobs.schema.json
RUN uv venv /venv --python 3.12 && uv pip install --python /venv/bin/python ".[gpu]"
ENV PATH=/venv/bin:$PATH EYELORE_PROVIDER=runpod EYELORE_RENDER_DIR=/repo/services/render
# ComfyUI + model staging arrive with the GPU handlers (Phase 3); weights live on a persistent volume, not in the image.
USER ubuntu
CMD ["eyelore-worker"]
