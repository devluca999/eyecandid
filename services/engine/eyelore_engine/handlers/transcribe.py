"""Word-level transcription with faster-whisper (ported from the legacy engine's word timing step)."""
from __future__ import annotations

import os


def run(inp: dict, ctx) -> dict:
    from faster_whisper import WhisperModel  # optional dependency: pip install eyelore-engine[gpu]

    path = ctx.download(inp["mediaId"])
    ctx.progress(0.1, "loading model")
    device = "cuda" if ctx.provider in {"colab", "modal", "runpod"} else "cpu"
    # a host may cap model size (e.g. CI runs "tiny"); the job's request is the default
    name = os.environ.get("EYELORE_TRANSCRIBE_MODEL") or inp.get("model", "small")
    model = WhisperModel(name, device=device, compute_type="float16" if device == "cuda" else "int8")
    ctx.progress(0.2, "listening")
    segments, info = model.transcribe(path, language=inp.get("language"), word_timestamps=True, vad_filter=False)
    words = []
    total = max(info.duration, 0.001)
    for seg in segments:
        for w in seg.words or []:
            words.append({"text": w.word.strip(), "startMs": int(w.start * 1000), "endMs": int(w.end * 1000), "conf": round(float(w.probability), 3)})
        ctx.progress(0.2 + 0.75 * min(seg.end / total, 1.0), "transcribing")
    return {"language": info.language, "words": words, "durationMs": int(info.duration * 1000)}
