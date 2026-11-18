"""HTTP client for the Convex worker API. Outbound calls only; no inbound ports."""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import httpx


@dataclass
class ClaimedJob:
    id: str
    type: str
    version: int
    idempotency_key: str
    input: dict[str, Any]
    attempt: int
    lease_expires_at: float


class StaleLease(Exception):
    """Our lease was lost (expired and requeued). Stop working on the job."""


class ConvexWorkerClient:
    def __init__(self, site_url: str, token: str, *, timeout: float = 30.0, transport: httpx.BaseTransport | None = None):
        self.http = httpx.Client(
            base_url=site_url.rstrip("/"),
            headers={"authorization": f"Bearer {token}", "content-type": "application/json"},
            timeout=timeout,
            transport=transport,
        )

    def _post(self, path: str, body: dict[str, Any]) -> httpx.Response:
        for attempt in range(4):
            try:
                r = self.http.post(path, json=body)
            except httpx.TransportError:
                if attempt == 3:
                    raise
                time.sleep(2**attempt)
                continue
            if r.status_code == 409:
                raise StaleLease(path)
            if r.status_code >= 500 and attempt < 3:
                time.sleep(2**attempt)
                continue
            r.raise_for_status()
            return r
        raise RuntimeError("unreachable")

    def claim(self, types: list[str], lease_ms: int = 60_000) -> ClaimedJob | None:
        r = self._post("/worker/claim", {"types": types, "leaseMs": lease_ms})
        if r.status_code == 204:
            return None
        j = r.json()["job"]
        return ClaimedJob(j["id"], j["type"], j["version"], j["idempotencyKey"], j["input"], j["attempt"], j["leaseExpiresAt"])

    def heartbeat(self, job_id: str) -> None:
        self._post("/worker/heartbeat", {"jobId": job_id})

    def progress(self, job_id: str, progress: float, stage: str) -> None:
        self._post("/worker/progress", {"jobId": job_id, "progress": max(0.0, min(1.0, progress)), "stage": stage[:80]})

    def complete(self, job_id: str, output: dict[str, Any]) -> None:
        self._post("/worker/complete", {"jobId": job_id, "output": output})

    def fail(self, job_id: str, error: str, retryable: bool = True, qc_failed: bool = False) -> None:
        """qc_failed: the job ran but its result failed the quality check (ADR 0014). Final; the credits come back."""
        body: dict[str, Any] = {"jobId": job_id, "error": error[:2000], "retryable": retryable}
        if qc_failed:
            body["outcome"] = "qc_failed"
        self._post("/worker/fail", body)

    def upload(self, data: bytes, content_type: str, kind: str = "generated") -> str:
        url = self._post("/worker/upload-url", {"contentType": content_type}).json()["uploadUrl"]
        storage_id = httpx.post(url, content=data, headers={"content-type": content_type}, timeout=600).json()["storageId"]
        return self._post("/worker/register-media", {"storageId": storage_id, "contentType": content_type, "kind": kind}).json()["mediaId"]

    def download_url(self, media_id: str) -> str:
        return self._post("/worker/download-url", {"mediaId": media_id}).json()["url"]
