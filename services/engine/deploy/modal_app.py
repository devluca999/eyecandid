"""Eyelore worker on Modal (GpuProvider "modal"). Same image and loop as everywhere else; pull-based, outbound only.

Deploy:   uvx --from modal modal deploy services/engine/deploy/modal_app.py                    (dev backend)
          EYELORE_ENV=prod uvx --from modal modal deploy services/engine/deploy/modal_app.py  (production backend)
Secrets:  a Modal secret named "eyelore-worker" (dev) / "eyelore-worker-prod" with EYELORE_CONVEX_SITE_URL and
          EYELORE_WORKER_TOKEN (token from `npx convex run workers:register '{"name":"modal","provider":"modal"}'`).
After a deploy: set the printed `wake` URL on the Convex deployment as EYELORE_WAKE_URL
          (`npx convex env set EYELORE_WAKE_URL <url>`, add `--prod` for production).

Scale to zero (ADR 0010). Nothing runs while the queue is empty:
  - Convex calls `wake` when a job is waiting and no worker is polling; `wake` starts `cpu_worker` unless one is up.
  - `cpu_worker` drains the queue and exits after EYELORE_IDLE_EXIT_S (default 180s) with nothing to do.
  - On a schedule (EYELORE_SAFETY_NET_HOURS, default every 6 hours; 0 = off) a run starts anyway and leaves after the
    idle window: a safety net for a missed wake. `modal.Period` is read at DEPLOY time, so changing the interval
    needs a redeploy (EYELORE_SAFETY_NET_HOURS=2 modal deploy ...). EYELORE_IDLE_EXIT_S is read inside the container
    from the Modal secret / deploy environment at start.
  - max_containers=1: Modal never runs two CPU workers at once, whatever calls it.
The cost follows use (minutes per edit) instead of a container kept warm around the clock. The price is a cold start
on the first clip after a quiet spell. GPU jobs (Phase 3) get their own function with gpu="L4" on the same image.
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

state = modal.Dict.from_name(f"eyelore-worker-state{SUFFIX}", create_if_missing=True)  # {"alive_at": unix seconds}

MAX_RUN_SECONDS = 50 * 60
IDLE_EXIT_SECONDS = int(os.environ.get("EYELORE_IDLE_EXIT_S", "180"))
# Safety-net interval in hours, fixed when the app is deployed (0 disables the schedule).
SAFETY_NET_HOURS = int(os.environ.get("EYELORE_SAFETY_NET_HOURS", "6"))
SAFETY_NET = modal.Period(hours=SAFETY_NET_HOURS) if SAFETY_NET_HOURS > 0 else None

# Modal list prices (modal.com/pricing, Nov 2026), USD per second: cpu=4.0 physical cores, memory=8192 MiB.
# Keep in step with the container size below; the Convex-side guard prices the same worker per hour (about $0.253).
CPU_CORES = 4.0
MEMORY_GIB = 8.0
CPU_USD_PER_CORE_SECOND = 0.0000131
MEMORY_USD_PER_GIB_SECOND = 0.00000222
CPU_WORKER_USD_PER_SECOND = CPU_CORES * CPU_USD_PER_CORE_SECOND + MEMORY_GIB * MEMORY_USD_PER_GIB_SECOND  # ~0.0000702


def estimated_cost_usd(seconds: float) -> float:
    """What a run of this many seconds costs at list price (an estimate; Modal's bill is the real number)."""
    return seconds * CPU_WORKER_USD_PER_SECOND
ALIVE_WINDOW_SECONDS = 30


@app.function(
    image=image,
    cpu=CPU_CORES,
    memory=int(MEMORY_GIB * 1024),
    max_containers=1,  # hard concurrency cap: one CPU worker at a time
    timeout=MAX_RUN_SECONDS + 600,
    schedule=SAFETY_NET,
    secrets=[modal.Secret.from_name(f"eyelore-worker{SUFFIX}")],
    volumes={"/home/ubuntu/.cache/huggingface": whisper_cache},
)
def cpu_worker() -> None:
    from eyelore_engine.client import ConvexWorkerClient
    from eyelore_engine.providers import from_env
    from eyelore_engine.worker import run_one

    started = time.time()
    if started - float(state.get("alive_at", 0) or 0) < ALIVE_WINDOW_SECONDS:
        print("[eyelore] another worker is already polling; leaving", flush=True)
        return
    state["alive_at"] = started
    provider = from_env()
    client = ConvexWorkerClient(os.environ["EYELORE_CONVEX_SITE_URL"], os.environ["EYELORE_WORKER_TOKEN"])
    name = f"modal-{os.environ.get('MODAL_TASK_ID', 'cpu')[-8:]}"
    print(f"[eyelore] {name} · {provider.capabilities()} · leaves after {IDLE_EXIT_SECONDS}s idle", flush=True)
    deadline = started + MAX_RUN_SECONDS
    last_busy = started
    last_mark = started
    idle = 0.5
    jobs = 0
    while time.time() < deadline:
        try:
            busy = run_one(client, provider, name)
        except Exception as e:  # noqa: BLE001 — a bad poll must not kill the worker
            print(f"[eyelore] poll failed: {e}", flush=True)
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
    still_busy = time.time() - last_busy < 5
    state["alive_at"] = 0
    whisper_cache.commit()
    ran_s = time.time() - started
    print(f"[eyelore] {name} leaving after {int(ran_s)}s · {jobs} job(s) · est. ${estimated_cost_usd(ran_s):.4f}", flush=True)
    if still_busy:
        cpu_worker.spawn()  # ran out its time mid-queue: hand over to a fresh run


wake_image = modal.Image.debian_slim().pip_install("fastapi[standard]")
with wake_image.imports():  # only inside the wake container; the worker image has no fastapi
    import fastapi


@app.function(image=wake_image, secrets=[modal.Secret.from_name(f"eyelore-worker{SUFFIX}")], max_containers=1)
@modal.fastapi_endpoint(method="POST")
def wake(request: fastapi.Request) -> dict:
    """Start a worker unless one is polling. Called by Convex (convex/wake.ts); carries no job, only "come and look".

    Auth: Convex stores only the SHA-256 of the worker token and sends sha256("wake:" + that hash); this side derives
    the same value from the token it holds. No second secret, and the header reveals neither the token nor its hash.
    """
    import hashlib
    import hmac

    token = os.environ["EYELORE_WORKER_TOKEN"]
    expected = hashlib.sha256(("wake:" + hashlib.sha256(token.encode()).hexdigest()).encode()).hexdigest()
    offered = [k.strip() for k in request.headers.get("x-eyelore-wake", "").split(",") if k.strip()][:8]
    if not any(hmac.compare_digest(k, expected) for k in offered):
        raise fastapi.HTTPException(status_code=401, detail="not allowed")
    if time.time() - float(state.get("alive_at", 0) or 0) < ALIVE_WINDOW_SECONDS:
        return {"started": False, "why": "a worker is already polling"}
    cpu_worker.spawn()
    return {"started": True}
