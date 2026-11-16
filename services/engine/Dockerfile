# Eyelore engine worker (CUDA). Same image on Modal, RunPod or any GPU host; pulls jobs over HTTPS (outbound only).
FROM nvidia/cuda:12.6.3-cudnn-runtime-ubuntu24.04
ENV DEBIAN_FRONTEND=noninteractive PYTHONUNBUFFERED=1 UV_SYSTEM_PYTHON=1
RUN apt-get update && apt-get install -y --no-install-recommends python3.12 python3.12-venv ffmpeg git curl ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=ghcr.io/astral-sh/uv:0.13.5 /uv /usr/local/bin/uv
WORKDIR /app
COPY services/engine/pyproject.toml services/engine/README.md* ./
COPY services/engine/eyelore_engine ./eyelore_engine
COPY packages/core/schema/jobs.schema.json ./eyelore_engine/jobs.schema.json
RUN uv venv /venv --python 3.12 && . /venv/bin/activate && uv pip install ".[gpu]"
ENV PATH=/venv/bin:$PATH EYELORE_PROVIDER=runpod
# ComfyUI + model staging are added with the GPU handlers (Phase 2/3); weights live on a persistent volume, not in the image.
USER 1000
CMD ["eyelore-worker"]
