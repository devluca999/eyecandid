"""Generated b-roll still: text to image on the GPU worker (ADR 0013).

Model: Tongyi-MAI/Z-Image-Turbo (Apache-2.0, 6B, ungated on Hugging Face), through diffusers' ZImagePipeline, 9
scheduler steps (8 DiT forwards), guidance 0 as the model card says for Turbo. Loaded once per container, lazily, on
the first still; weights come from the Hugging Face cache (a Modal volume on the GPU app).

The model call is a seam (`generate=`): unit tests inject a fake that returns PNG bytes, so CI needs no GPU, torch or
PIL. Real generation is untested until a GPU worker runs it. There is no fallback image anywhere: no GPU, no still.
"""
from __future__ import annotations

import hashlib
import os
import tempfile
import threading
from typing import Callable

from . import NonRetryable

MODEL_ID = os.environ.get("EYELORE_STILL_MODEL", "Tongyi-MAI/Z-Image-Turbo")
STEPS = int(os.environ.get("EYELORE_STILL_STEPS", "9"))

# what the model renders well: both sides multiples of 16, 256..2048, at most ~2 megapixels
MIN_SIDE, MAX_SIDE, MAX_PIXELS = 256, 2048, 2048 * 1024

Generate = Callable[[str, int, int, int], bytes]
"""(prompt, width, height, seed) -> PNG bytes"""

_pipe = None
_lock = threading.Lock()


def _load():
    """The pipeline, loaded once per process (first still pays the load; the rest reuse it)."""
    global _pipe
    with _lock:
        if _pipe is None:
            import torch
            from diffusers import ZImagePipeline

            if not torch.cuda.is_available():
                raise RuntimeError("no CUDA device: stills only run on the GPU worker")
            pipe = ZImagePipeline.from_pretrained(MODEL_ID, torch_dtype=torch.bfloat16)
            # bf16: ~12 GB transformer + ~8 GB text encoder, inside an L4's 24 GB. If a GPU turns out too small, set
            # EYELORE_STILL_OFFLOAD=1 (slower: modules move to the GPU only while they run) rather than a bigger card.
            if os.environ.get("EYELORE_STILL_OFFLOAD") == "1":
                pipe.enable_model_cpu_offload()
            else:
                pipe = pipe.to("cuda")
            _pipe = pipe
        return _pipe


def model_generate(prompt: str, w: int, h: int, seed: int) -> bytes:
    """The real model call. Runs only on a CUDA host with the `still` extra installed."""
    import io

    import torch

    pipe = _load()
    gen = torch.Generator("cuda").manual_seed(seed)
    image = pipe(prompt=prompt, width=w, height=h, num_inference_steps=STEPS, guidance_scale=0.0, generator=gen).images[0]
    buf = io.BytesIO()
    image.save(buf, format="PNG")
    return buf.getvalue()


def check_size(w: int, h: int) -> None:
    if w % 16 or h % 16:
        raise NonRetryable(f"still size {w}x{h}: both sides must be multiples of 16")
    if not (MIN_SIDE <= w <= MAX_SIDE and MIN_SIDE <= h <= MAX_SIDE) or w * h > MAX_PIXELS:
        raise NonRetryable(f"still size {w}x{h} is outside {MIN_SIDE}..{MAX_SIDE} per side / {MAX_PIXELS} pixels")


def seed_for(prompt: str, w: int, h: int) -> int:
    """No seed given: a stable one from the request, so a retry of the same job makes the same picture."""
    return int.from_bytes(hashlib.sha256(f"{prompt}|{w}x{h}".encode()).digest()[:4], "big")


def run(inp: dict, ctx, generate: Generate | None = None) -> dict:
    if inp.get("refMediaIds"):
        raise NonRetryable("reference images aren't supported by the still model yet")
    prompt = str(inp["prompt"]).strip()
    if not prompt:
        raise NonRetryable("empty prompt")
    w, h = int(inp["w"]), int(inp["h"])
    check_size(w, h)
    seed = int(inp["seed"]) if inp.get("seed") is not None else seed_for(prompt, w, h)

    gen = generate or model_generate
    if generate is None and _pipe is None:
        ctx.progress(0.05, "loading the image model")
        _load()
    ctx.progress(0.3, "generating a still")
    png = gen(prompt, w, h, seed)
    if not png.startswith(b"\x89PNG"):
        raise RuntimeError("the model returned something that isn't a PNG")
    ctx.progress(0.9, "saving")
    fd, path = tempfile.mkstemp(prefix="eyelore-still-", suffix=".png")
    with os.fdopen(fd, "wb") as f:
        f.write(png)
    try:
        media_id = ctx.upload(path, "image/png", "generated")
    finally:
        os.unlink(path)
    return {"mediaId": media_id}
