"""Eyecandid GPU worker pool on Modal (provider "modal-gpu", ADR 0013). Generated media only; never the free CPU work.

NOT DEPLOYED. Deploying starts billing on the Modal workspace; the owner approves it (HANDOFF.md "Needs you").

Deploy:   uvx --from modal modal deploy services/engine/deploy/modal_gpu_app.py                    (dev backend)
          EYELORE_ENV=prod uvx --from modal modal deploy services/engine/deploy/modal_gpu_app.py  (production backend)
Secrets:  a Modal secret "eyelore-gpu" (dev) / "eyelore-gpu-prod" with EYELORE_CONVEX_SITE_URL and EYELORE_WORKER_TOKEN,
          the token from `npx convex run workers:register '{"name":"modal-gpu","provider":"modal-gpu"}'` (its own token,
          not the CPU worker's: the provider name is what puts it in the GPU pool, server-side).
After a deploy: set the printed `wake` URL as EYELORE_GPU_WAKE_URL on the Convex deployment
          (`npx convex env set EYELORE_GPU_WAKE_URL <url>`, add `--prod` for production).

Scale to zero, like the CPU app (ADR 0010), but stricter because a GPU second costs ~17x a CPU core second:
  - min containers 0, at most 1 GPU container at a time (max_containers=1), and a hard per-container timeout.
  - Convex calls `wake` when a GPU job waits and no GPU worker polls; `wake` spawns `gpu_worker` unless one is up.
  - `gpu_worker` drains GPU jobs and exits after EYELORE_GPU_IDLE_EXIT_S (default 60s) with nothing to do.
  - No hourly run (the CPU app has one): an idle GPU start every hour would cost more than the stills. Convex's minute
    cron re-checks waiting jobs and calls `wake` again, which is the safety net here.
Model weights (Z-Image-Turbo, Apache-2.0, ungated) download once into the `eyelore-gpu-weights` volume.
"""
from __future__ import annotations

import os
import time
from pathlib import Path

import modal

ENV = os.environ.get("EYELORE_ENV", "dev")
SUFFIX = "" if ENV == "dev" else f"-{ENV}"

GPU = os.environ.get("EYELORE_GPU", "L4")  # 24 GB; Z-Image-Turbo (6B, bf16) fits without CPU offload
HF_HOME = "/cache/hf"

# A slim CUDA-free Python image: torch wheels bring their own CUDA runtime. No Node, Remotion or ffmpeg: this pool never
# renders or transcribes. The engine package is added from the repo on the deploying machine.
if modal.is_local():
    REPO = Path(__file__).resolve().parents[3]
    ENGINE = REPO / "services/engine"
    image = (
        modal.Image.debian_slim(python_version="3.12")
        .pip_install("httpx>=0.28", "jsonschema>=4.23", "sentry-sdk>=2.0")
        .pip_install("torch==2.9.1", "diffusers==0.36.0", "transformers==4.57.3", "accelerate==1.12.0", "pillow==12.0.0")
        .env({"EYELORE_PROVIDER": "modal-gpu", "EYELORE_ENV": ENV, "HF_HOME": HF_HOME, "HF_HUB_ENABLE_HF_TRANSFER": "0"})
        .add_local_dir(str(ENGINE / "eyelore_engine"), "/root/eyelore_engine", copy=True)
        .add_local_file(str(REPO / "packages/core/schema/jobs.schema.json"), "/root/eyelore_engine/jobs.schema.json", copy=True)
    )
else:
    image = modal.Image.debian_slim()  # placeholder; the deployed function keeps the image it was built with

app = modal.App(f"eyelore-gpu{SUFFIX}")
weights = modal.Volume.from_name("eyelore-gpu-weights", create_if_missing=True)  # shared across backends: weights only
state = modal.Dict.from_name(f"eyelore-gpu-state{SUFFIX}", create_if_missing=True)  # {"alive_at": unix seconds}

MAX_RUN_SECONDS = 15 * 60  # hard ceiling per container, including model load: ~$0.20 of L4 at most per start
IDLE_EXIT_SECONDS = int(os.environ.get("EYELORE_GPU_IDLE_EXIT_S", "60"))
ALIVE_WINDOW_SECONDS = 30


@app.function(
    image=image,
    gpu=GPU,
    cpu=2.0,
    memory=32768,  # the pipeline is staged in RAM before it moves to the GPU
    timeout=MAX_RUN_SECONDS + 120,
    min_containers=0,
    max_containers=1,
    secrets=[modal.Secret.from_name(f"eyelore-gpu{SUFFIX}")],
    volumes={HF_HOME: weights},
)
def gpu_worker() -> None:
    from eyelore_engine.client import ConvexWorkerClient
    from eyelore_engine.providers import claimable, from_env
    from eyelore_engine.worker import run_one

    started = time.time()
    if started - float(state.get("alive_at", 0) or 0) < ALIVE_WINDOW_SECONDS:
        print("[eyelore-gpu] another GPU worker is already polling; leaving", flush=True)
        return
    provider = from_env()
    types = claimable(provider)
    if not types:
        raise SystemExit(f"[eyelore-gpu] {provider.describe()} advertises no GPU job types (no CUDA or no diffusers); refusing to idle on a GPU")
    state["alive_at"] = started
    client = ConvexWorkerClient(os.environ["EYELORE_CONVEX_SITE_URL"], os.environ["EYELORE_WORKER_TOKEN"])
    name = f"modal-gpu-{os.environ.get('MODAL_TASK_ID', 'gpu')[-8:]}"
    print(f"[eyelore-gpu] {name} · {provider.describe()} · {types} · leaves after {IDLE_EXIT_SECONDS}s idle", flush=True)
    deadline = started + MAX_RUN_SECONDS
    last_busy = started
    last_mark = started
    idle = 0.5
    jobs = 0
    try:
        while time.time() < deadline:
            try:
                busy = run_one(client, provider, name)
            except Exception as e:  # noqa: BLE001 — a bad poll must not kill the worker
                print(f"[eyelore-gpu] poll failed: {e}", flush=True)
                busy = False
            now = time.time()
            if now - last_mark > 10:
                state["alive_at"] = now
                last_mark = now
            if busy:
                jobs += 1
                last_busy = now
                idle = 0.5
                continue
            if now - last_busy > IDLE_EXIT_SECONDS:
                break
            idle = min(idle * 1.5, 3.0)
            time.sleep(idle)
    finally:
        state["alive_at"] = 0
        weights.commit()
    # no self-respawn at the deadline (the CPU app does): a GPU queue that outlives 15 minutes waits for the next wake,
    # which Convex's minute cron sends, so a runaway can never chain containers on its own
    print(f"[eyelore-gpu] {name} leaving after {int(time.time() - started)}s · {jobs} job(s)", flush=True)


wake_image = modal.Image.debian_slim().pip_install("fastapi[standard]")
with wake_image.imports():  # only inside the wake container; the worker image has no fastapi
    import fastapi


@app.function(image=wake_image, secrets=[modal.Secret.from_name(f"eyelore-gpu{SUFFIX}")], max_containers=1)
@modal.fastapi_endpoint(method="POST")
def wake(request: fastapi.Request) -> dict:
    """Start the GPU worker unless one is polling. Called by Convex (convex/wake.ts, pool "gpu"); carries no job.

    Auth: the same scheme as the CPU app: Convex sends sha256("wake:" + sha256(token)) for the GPU worker's token.
    """
    import hashlib
    import hmac

    token = os.environ["EYELORE_WORKER_TOKEN"]
    expected = hashlib.sha256(("wake:" + hashlib.sha256(token.encode()).hexdigest()).encode()).hexdigest()
    offered = [k.strip() for k in request.headers.get("x-eyelore-wake", "").split(",") if k.strip()][:8]
    if not any(hmac.compare_digest(k, expected) for k in offered):
        raise fastapi.HTTPException(status_code=401, detail="not allowed")
    if time.time() - float(state.get("alive_at", 0) or 0) < ALIVE_WINDOW_SECONDS:
        return {"started": False, "why": "a GPU worker is already polling"}
    gpu_worker.spawn()
    return {"started": True}
