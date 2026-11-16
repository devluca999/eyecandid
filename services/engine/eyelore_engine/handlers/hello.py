"""Phase 1 round-trip job: proves web → Convex queue → worker → live progress → result."""
from __future__ import annotations

import os
import time


def run(inp: dict, ctx) -> dict:
    steps = int(inp.get("steps", 5))
    delay = float(os.environ.get("EYELORE_HELLO_STEP_S", "0.6"))
    for i in range(steps):
        ctx.progress((i + 1) / (steps + 1), f"step {i + 1} of {steps}")
        time.sleep(delay)
    return {"echo": inp["message"], "worker": ctx.worker_name, "provider": ctx.provider}
