"""Job handlers: pure functions of (input, ctx) -> output. ctx reports progress and fetches media."""
from __future__ import annotations

from typing import Any, Callable, Protocol


class JobContext(Protocol):
    worker_name: str
    provider: str

    def progress(self, p: float, stage: str) -> None: ...
    def download(self, media_id: str) -> str: ...  # returns a local file path
    def upload(self, path: str, content_type: str, kind: str = "generated") -> str: ...  # returns mediaId


Handler = Callable[[dict[str, Any], JobContext], dict[str, Any]]


def registry() -> dict[str, Handler]:
    from . import autocut, hello, transcribe

    return {"hello": hello.run, "autocut": autocut.run, "transcribe": transcribe.run}
