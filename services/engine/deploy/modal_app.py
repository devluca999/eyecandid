"""Eyelore worker on Modal (GpuProvider "modal"). Same image and loop as everywhere else; pull-based, outbound only.

Deploy:   uvx --from modal modal deploy services/engine/deploy/modal_app.py                    (dev backend)
          EYELORE_ENV=prod uvx --from modal modal deploy services/engine/deploy/modal_app.py  (production backend)
Secrets:  a Modal secret named "eyelore-worker" with EYELORE_CONVEX_SITE_URL and EYELORE_WORKER_TOKEN
          (token from `npx convex run workers:register '{"name":"modal","provider":"modal"}'`, prod or dev deployment).

Always-on: every 25 minutes a run starts that polls for 30, so one CPU worker is always warm (no cold start on
the core loop) and runs overlap briefly — leases make overlap safe. GPU jobs (Phase 3) get their own function
with gpu="L4" on the same image.
"""
from __future__ import annotations

import os
import time
from pathlib import Path

import modal

# One deployed app per backend: EYELORE_ENV=dev (default) → "eyelore-worker" + secret "eyelore-worker";
# EYELORE_ENV=prod → "eyelore-worker-prod" + secret "eyelore-worker-prod".
ENV = os.environ.get("EYELORE_ENV", "dev")
SUFFIX = "" if ENV == "dev" else f"-{ENV}"

# The image is defined from the repo on the deploying machine only; inside the container this file lives at /root/.
if modal.is_local():
    REPO = Path(__file__).resolve().parents[3]
    image = modal.Image.from_dockerfile(
        str(REPO / "services/engine/Dockerfile"),
        context_dir=str(REPO),
        ignore=["**/node_modules", "**/.next", "**/.venv", "legacy-engine", "design", "tmp-clips", "**/.git"],
    ).env({"EYELORE_PROVIDER": "modal", "EYELORE_TRANSCRIBE_MODEL": "small", "EYELORE_ENV": ENV})
else:
    image = modal.Image.debian_slim()  # placeholder; the deployed function keeps the image it was built with

app = modal.App(f"eyelore-worker{SUFFIX}")
whisper_cache = modal.Volume.from_name("eyelore-whisper-cache", create_if_missing=True)  # shared: model weights only

RUN_SECONDS = 30 * 60


@app.function(
    image=image,
    cpu=4.0,
    memory=8192,
    timeout=RUN_SECONDS + 300,
    schedule=modal.Period(minutes=25),
    secrets=[modal.Secret.from_name(f"eyelore-worker{SUFFIX}")],
    volumes={"/home/ubuntu/.cache/huggingface": whisper_cache},
)
def cpu_worker() -> None:
    from eyelore_engine.client import ConvexWorkerClient
    from eyelore_engine.providers import from_env
    from eyelore_engine.worker import run_one

    provider = from_env()
    client = ConvexWorkerClient(os.environ["EYELORE_CONVEX_SITE_URL"], os.environ["EYELORE_WORKER_TOKEN"])
    name = f"modal-{os.environ.get('MODAL_TASK_ID', 'cpu')[-8:]}"
    print(f"[eyelore] {name} · {provider.capabilities()}", flush=True)
    deadline = time.time() + RUN_SECONDS
    idle = 0.5
    while time.time() < deadline:
        try:
            busy = run_one(client, provider, name)
        except Exception as e:  # noqa: BLE001 — a bad poll must not kill the warm worker
            print(f"[eyelore] poll failed: {e}", flush=True)
            busy = False
        idle = 0.5 if busy else min(idle * 1.5, 3.0)
        if not busy:
            time.sleep(idle)
    whisper_cache.commit()
