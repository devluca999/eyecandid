"""GpuProvider: where the worker runs. The job loop is identical on every provider (ADR 0003)."""
from __future__ import annotations

import os
import platform
import shutil
from abc import ABC, abstractmethod


class GpuProvider(ABC):
    name: str

    @abstractmethod
    def capabilities(self) -> list[str]:
        """Job types this host can run."""

    def prepare(self) -> None:
        """Stage models, start ComfyUI, etc. Called once before the loop."""

    def describe(self) -> str:
        return f"{self.name} on {platform.node()}"


class CpuStubProvider(GpuProvider):
    """Deterministic fake outputs for CI and local development. Refuses non-local backends unless allowed."""

    name = "cpu-stub"

    def capabilities(self) -> list[str]:
        return ["hello", "autocut"]


class LocalCpuProvider(GpuProvider):
    """Real CPU work that needs no GPU: transcription (faster-whisper small), autocut, ffmpeg QC."""

    name = "cpu"

    def capabilities(self) -> list[str]:
        caps = ["hello", "autocut"]
        has_ffmpeg = bool(shutil.which("ffmpeg"))
        try:
            import faster_whisper  # noqa: F401

            if has_ffmpeg:
                caps.append("transcribe")
        except ImportError:
            pass
        try:
            import cv2  # noqa: F401

            caps.append("reframe")
        except ImportError:
            pass
        if has_ffmpeg and shutil.which("node"):
            try:
                from .handlers.render import _render_dir

                _render_dir()
                caps.append("render")
            except RuntimeError:
                pass
        return caps


class ColabProvider(GpuProvider):
    """Colab L4/A100. Models staged to local SSD from the HF cache; ComfyUI on 127.0.0.1:8188."""

    name = "colab"

    def capabilities(self) -> list[str]:
        # GPU job handlers are ported in Phase 2/3; advertise only what is implemented.
        return LocalCpuProvider().capabilities()


class ModalProvider(LocalCpuProvider):
    """Modal container from the engine image: real CPU work (transcribe, autocut, reframe, render)."""

    name = "modal"


class RunPodProvider(ColabProvider):
    name = "runpod"


# The free CPU job types (packages/core/src/plans.ts FREE_CPU_JOB_TYPES; tests/test_pools.py keeps the two in step).
CPU_JOB_TYPES = frozenset({"hello", "transcribe", "autocut", "reframe", "render"})


def is_gpu_pool(provider: GpuProvider) -> bool:
    """A provider named `*-gpu` is the GPU pool (same rule as isGpuWorkerProvider in packages/core)."""
    return provider.name.endswith("-gpu")


def claimable(provider: GpuProvider) -> list[str]:
    """The job types this worker asks for: its capabilities, restricted to its pool. The server enforces the same."""
    gpu = is_gpu_pool(provider)
    return [t for t in provider.capabilities() if (t not in CPU_JOB_TYPES) == gpu]


class ModalGpuProvider(GpuProvider):
    """Modal GPU function (services/engine/deploy/modal_gpu_app.py): GPU job types only, never the free CPU work."""

    name = "modal-gpu"

    def capabilities(self) -> list[str]:
        try:
            import diffusers  # noqa: F401
            import torch

            if not torch.cuda.is_available():
                return []
        except ImportError:
            return []
        return ["still"]

    def describe(self) -> str:
        try:
            import torch

            gpu = torch.cuda.get_device_name(0) if torch.cuda.is_available() else "no cuda"
        except ImportError:
            gpu = "no torch"
        return f"{self.name} on {platform.node()} ({gpu})"


PROVIDERS: dict[str, type[GpuProvider]] = {
    p.name: p for p in (CpuStubProvider, LocalCpuProvider, ColabProvider, ModalProvider, RunPodProvider, ModalGpuProvider)
}


def from_env() -> GpuProvider:
    name = os.environ.get("EYELORE_PROVIDER", "cpu")
    if name not in PROVIDERS:
        raise SystemExit(f"unknown EYELORE_PROVIDER {name!r}; one of {sorted(PROVIDERS)}")
    return PROVIDERS[name]()
