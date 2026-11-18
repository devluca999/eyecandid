"""The `still` handler's plumbing, with the model call injected.

NOT a test of image generation: no GPU, torch or diffusers in CI, so the injected generator returns a few fixed PNG
bytes. What is proven here: input checks, seed handling, progress, the upload path and the contract output, and that
the CPU worker never asks for a still. Real generation (Z-Image-Turbo on CUDA) is untested until a GPU worker runs it.
"""
import os
import re
from pathlib import Path

import pytest

from eyelore_engine import contract
from eyelore_engine.handlers import NonRetryable, registry, still
from eyelore_engine.providers import CPU_JOB_TYPES, CpuStubProvider, LocalCpuProvider, ModalGpuProvider, ModalProvider, claimable
from eyelore_engine.worker import run_one

from test_worker_loop import FakeConvex, client

FAKE_PNG = b"\x89PNG\r\n\x1a\n" + b"test-only bytes, not an image"


class Ctx:
    worker_name, provider = "w", "modal-gpu"

    def __init__(self):
        self.progress_calls, self.uploads = [], []

    def progress(self, p, stage):
        self.progress_calls.append((p, stage))

    def upload(self, path, content_type, kind="generated"):
        with open(path, "rb") as f:
            self.uploads.append((f.read(), content_type, kind, path))
        return "media_still_1"


def test_generates_at_the_requested_size_and_seed_and_uploads_the_png():
    calls = []

    def gen(prompt, w, h, seed):
        calls.append((prompt, w, h, seed))
        return FAKE_PNG

    ctx = Ctx()
    out = still.run({"prompt": " a ring on a nightstand ", "refMediaIds": [], "w": 720, "h": 1280, "seed": 7}, ctx, generate=gen)
    assert out == {"mediaId": "media_still_1"}
    contract.validate_output("still", out)
    assert calls == [("a ring on a nightstand", 720, 1280, 7)]
    data, ctype, kind, path = ctx.uploads[0]
    assert (data, ctype, kind) == (FAKE_PNG, "image/png", "generated")
    assert not os.path.exists(path)  # temp file cleaned up
    assert [s for _, s in ctx.progress_calls] == ["generating a still", "saving"]


def test_no_seed_gives_a_stable_one_so_a_retry_makes_the_same_picture():
    seeds = []
    gen = lambda p, w, h, s: seeds.append(s) or FAKE_PNG  # noqa: E731
    for _ in range(2):
        still.run({"prompt": "p", "refMediaIds": [], "w": 512, "h": 512}, Ctx(), generate=gen)
    assert seeds[0] == seeds[1] and 0 <= seeds[0] < 2**32


@pytest.mark.parametrize("w,h", [(720, 1281), (100, 512), (4096, 512), (2048, 2048)])
def test_refuses_sizes_the_model_cannot_render_without_retry(w, h):
    with pytest.raises(NonRetryable):
        still.run({"prompt": "p", "refMediaIds": [], "w": w, "h": h}, Ctx(), generate=lambda *a: FAKE_PNG)


def test_refuses_reference_images_rather_than_ignoring_them():
    with pytest.raises(NonRetryable, match="reference images"):
        still.run({"prompt": "p", "refMediaIds": ["m1"], "w": 512, "h": 512}, Ctx(), generate=lambda *a: FAKE_PNG)


def test_a_non_png_from_the_model_is_an_error_not_an_upload():
    ctx = Ctx()
    with pytest.raises(RuntimeError):
        still.run({"prompt": "p", "refMediaIds": [], "w": 512, "h": 512}, ctx, generate=lambda *a: b"nope")
    assert ctx.uploads == []


def test_still_is_registered_and_in_the_contract():
    assert registry()["still"] is still.run
    contract.validate_input("still", {"prompt": "p", "refMediaIds": [], "w": 720, "h": 1280})


def test_cpu_workers_never_ask_for_a_still():
    for p in (CpuStubProvider(), LocalCpuProvider(), ModalProvider()):
        assert "still" not in claimable(p)
        assert set(claimable(p)) <= CPU_JOB_TYPES


def test_gpu_provider_claims_only_gpu_types(monkeypatch):
    monkeypatch.setattr(ModalGpuProvider, "capabilities", lambda self: ["still", "hello", "render"])
    assert claimable(ModalGpuProvider()) == ["still"]


def test_gpu_provider_without_cuda_advertises_nothing():
    # CI has no torch/diffusers: the GPU provider must not pretend
    assert ModalGpuProvider().capabilities() == [] or os.environ.get("EYELORE_HAS_GPU") == "1"


def test_a_bad_size_fails_the_job_without_retry_through_the_worker_loop(monkeypatch):
    monkeypatch.setattr(ModalGpuProvider, "capabilities", lambda self: ["still"])
    fake = FakeConvex([{"id": "s1", "type": "still", "input": {"prompt": "p", "refMediaIds": [], "w": 721, "h": 1280}}])
    run_one(client(fake), ModalGpuProvider(), "gpu", handlers={**registry(), "still": lambda inp, ctx: still.run(inp, ctx, generate=lambda *a: FAKE_PNG)})
    assert fake.jobs["s1"]["status"] == "failed" and fake.jobs["s1"]["retryable"] is False


def test_python_cpu_types_match_packages_core():
    plans = (Path(__file__).resolve().parents[3] / "packages/core/src/plans.ts").read_text()
    m = re.search(r"FREE_CPU_JOB_TYPES = \[([^\]]*)\]", plans)
    assert m, "FREE_CPU_JOB_TYPES not found in plans.ts"
    assert set(re.findall(r'"([a-z0-9]+)"', m.group(1))) == CPU_JOB_TYPES
