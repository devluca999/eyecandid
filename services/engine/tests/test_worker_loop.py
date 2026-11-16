"""Worker loop against an in-memory fake of the Convex worker API (no network)."""
import json

import httpx

from eyelore_engine.client import ConvexWorkerClient
from eyelore_engine.providers import CpuStubProvider
from eyelore_engine.worker import run_one


class FakeConvex:
    def __init__(self, jobs):
        self.jobs = {j["id"]: {**j, "status": "queued", "progress": 0.0} for j in jobs}
        self.calls = []

    def __call__(self, req: httpx.Request) -> httpx.Response:
        assert req.headers["authorization"] == "Bearer elw_test"
        body = json.loads(req.content or b"{}")
        self.calls.append(req.url.path)
        path = req.url.path
        if path == "/worker/claim":
            for j in self.jobs.values():
                if j["status"] == "queued" and j["type"] in body["types"]:
                    j["status"] = "leased"
                    return httpx.Response(200, json={"job": {"id": j["id"], "type": j["type"], "version": 1, "idempotencyKey": j["id"], "input": j["input"], "attempt": 1, "leaseExpiresAt": 0}})
            return httpx.Response(204)
        j = self.jobs[body["jobId"]]
        if path == "/worker/progress":
            j["progress"] = body["progress"]
        elif path == "/worker/complete":
            j.update(status="succeeded", output=body["output"])
        elif path == "/worker/fail":
            j.update(status="failed", error=body["error"], retryable=body["retryable"])
        return httpx.Response(200, json={"ok": True})


def client(fake):
    return ConvexWorkerClient("http://fake", "elw_test", transport=httpx.MockTransport(fake))


def test_hello_round_trip(monkeypatch):
    monkeypatch.setenv("EYELORE_HELLO_STEP_S", "0")
    fake = FakeConvex([{"id": "j1", "type": "hello", "input": {"message": "hi", "steps": 3}}])
    assert run_one(client(fake), CpuStubProvider(), "test-worker") is True
    assert fake.jobs["j1"]["status"] == "succeeded"
    assert fake.jobs["j1"]["output"] == {"echo": "hi", "worker": "test-worker", "provider": "cpu-stub"}
    assert fake.calls.count("/worker/progress") == 3
    assert run_one(client(fake), CpuStubProvider(), "test-worker") is False  # queue empty


def test_bad_input_fails_without_retry():
    fake = FakeConvex([{"id": "j2", "type": "hello", "input": {"steps": 3}}])
    run_one(client(fake), CpuStubProvider(), "w")
    assert fake.jobs["j2"]["status"] == "failed" and fake.jobs["j2"]["retryable"] is False
    assert "contract violation" in fake.jobs["j2"]["error"]


def test_handler_crash_is_retryable(monkeypatch):
    from eyelore_engine import handlers

    def boom(inp, ctx):
        raise RuntimeError("cuda oom")

    fake = FakeConvex([{"id": "j3", "type": "hello", "input": {"message": "x", "steps": 1}}])
    run_one(client(fake), CpuStubProvider(), "w", handlers={**handlers.registry(), "hello": boom})
    assert fake.jobs["j3"]["status"] == "failed" and fake.jobs["j3"]["retryable"] is True
