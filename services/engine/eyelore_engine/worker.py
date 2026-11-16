"""The worker loop. Same code on Colab, Modal, RunPod or a laptop: only the GpuProvider differs.

Env:
  EYELORE_CONVEX_SITE_URL   https://<deployment>.convex.site  (or http://127.0.0.1:3211 locally)
  EYELORE_WORKER_TOKEN      from `npx convex run workers:register`
  EYELORE_PROVIDER          cpu-stub | cpu | colab | modal | runpod
  EYELORE_WORKER_NAME       optional, defaults to the hostname
"""
from __future__ import annotations

import os
import platform
import signal
import sys
import tempfile
import threading
import time
import traceback
from urllib.parse import urlparse

import httpx
from jsonschema import ValidationError

from . import contract
from .client import ClaimedJob, ConvexWorkerClient, StaleLease
from .handlers import registry
from .providers import GpuProvider, from_env


class _Ctx:
    def __init__(self, client: ConvexWorkerClient, job: ClaimedJob, worker_name: str, provider: str):
        self.client, self.job, self.worker_name, self.provider = client, job, worker_name, provider
        self._tmp = tempfile.mkdtemp(prefix="eyelore-")

    def progress(self, p: float, stage: str) -> None:
        self.client.progress(self.job.id, p, stage)

    def url(self, media_id: str) -> str:
        """Signed URL for a media item (for tools that stream, like the Remotion renderer)."""
        return self.client.download_url(media_id)

    def download(self, media_id: str) -> str:
        url = self.client.download_url(media_id)
        path = os.path.join(self._tmp, media_id)
        with httpx.stream("GET", url, timeout=600) as r, open(path, "wb") as f:
            r.raise_for_status()
            for chunk in r.iter_bytes(1 << 20):
                f.write(chunk)
        return path

    def upload(self, path: str, content_type: str, kind: str = "generated") -> str:
        with open(path, "rb") as f:
            return self.client.upload(f.read(), content_type, kind)


class _Heartbeat(threading.Thread):
    def __init__(self, client: ConvexWorkerClient, job_id: str, every_s: float = 15.0):
        super().__init__(daemon=True)
        self.client, self.job_id, self.every_s = client, job_id, every_s
        self.stop = threading.Event()
        self.lost = threading.Event()

    def run(self) -> None:
        while not self.stop.wait(self.every_s):
            try:
                self.client.heartbeat(self.job_id)
            except StaleLease:
                self.lost.set()
                return
            except Exception:  # transient; the lease has slack
                pass


def run_one(client: ConvexWorkerClient, provider: GpuProvider, worker_name: str, handlers=None) -> bool:
    """Claim and run one job. Returns False if the queue was empty."""
    handlers = handlers or registry()
    types = [t for t in provider.capabilities() if t in handlers and t in contract.job_types()]
    job = client.claim(types)
    if job is None:
        return False
    hb = _Heartbeat(client, job.id)
    hb.start()
    try:
        if job.version != contract.version_of(job.type):
            client.fail(job.id, f"worker supports {job.type} v{contract.version_of(job.type)}, job is v{job.version}", retryable=True)
            return True
        contract.validate_input(job.type, job.input)
        output = handlers[job.type](job.input, _Ctx(client, job, worker_name, provider.name))
        contract.validate_output(job.type, output)
        client.complete(job.id, output)
    except StaleLease:
        print(f"[eyelore] lost lease on {job.id}; dropping it", file=sys.stderr)
    except ValidationError as e:
        client.fail(job.id, f"contract violation: {e.message}", retryable=False)
    except Exception as e:  # noqa: BLE001
        traceback.print_exc()
        try:
            client.fail(job.id, f"{type(e).__name__}: {e}", retryable=True)
        except StaleLease:
            pass
    finally:
        hb.stop.set()
    return True


def main() -> None:
    site = os.environ.get("EYELORE_CONVEX_SITE_URL")
    token = os.environ.get("EYELORE_WORKER_TOKEN")
    if not site or not token:
        raise SystemExit("set EYELORE_CONVEX_SITE_URL and EYELORE_WORKER_TOKEN")
    provider = from_env()
    host = urlparse(site).hostname or ""
    if provider.name == "cpu-stub" and host not in {"127.0.0.1", "localhost"} and os.environ.get("EYELORE_ALLOW_STUB") != "1":
        raise SystemExit("cpu-stub only runs against a local backend (set EYELORE_ALLOW_STUB=1 to override for previews)")
    name = os.environ.get("EYELORE_WORKER_NAME", platform.node())
    provider.prepare()
    client = ConvexWorkerClient(site, token)
    print(f"[eyelore] {provider.describe()} · types {provider.capabilities()} · polling {site}", flush=True)
    stopping = threading.Event()
    signal.signal(signal.SIGTERM, lambda *_: stopping.set())
    idle = 0.5
    while not stopping.is_set():
        try:
            busy = run_one(client, provider, name)
        except httpx.HTTPError as e:
            print(f"[eyelore] backend unreachable: {e}", file=sys.stderr)
            busy = False
        idle = 0.5 if busy else min(idle * 1.5, 5.0)
        if not busy:
            time.sleep(idle)


if __name__ == "__main__":
    main()
