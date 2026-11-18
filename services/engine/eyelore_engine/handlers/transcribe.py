"""Word-level transcription with faster-whisper (ported from the legacy engine's word timing step).

Each word also carries `rms`: its loudness relative to the take's median word (emphasis punch-ins, the energy dial).
"""
from __future__ import annotations

import math
import os


def word_rms(samples, sample_rate: int, words: list[dict]) -> list[float]:
    """Per-word RMS relative to the median word, from mono PCM (twin of core/src/emphasis.ts wordRms).
    Words outside the audio, or a take with no level at all, get 0. Works on a list or a numpy array."""
    n = len(samples)
    raw: list[float] = []
    for w in words:
        a = max(0, math.floor(w["startMs"] / 1000 * sample_rate))
        b = min(n, math.ceil(w["endMs"] / 1000 * sample_rate))
        if b <= a:
            raw.append(0.0)
            continue
        seg = samples[a:b]
        try:  # numpy: vectorised
            s = float((seg * seg).sum())
        except TypeError:
            s = sum(x * x for x in seg)
        raw.append(math.sqrt(s / (b - a)))
    nz = sorted(v for v in raw if v > 0)
    if not nz:
        return [0.0 for _ in raw]
    mid = len(nz) // 2
    median = nz[mid] if len(nz) % 2 else (nz[mid - 1] + nz[mid]) / 2
    return [round(v / median, 2) for v in raw]


def run(inp: dict, ctx) -> dict:
    from faster_whisper import WhisperModel  # optional dependency: pip install eyelore-engine[gpu]

    path = ctx.download(inp["mediaId"])
    ctx.progress(0.1, "loading model")
    # ask the hardware, not the provider name: a Modal/RunPod container may be CPU-only
    try:
        import ctranslate2

        device = "cuda" if ctranslate2.get_cuda_device_count() > 0 else "cpu"
    except Exception:  # noqa: BLE001
        device = "cpu"
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
    # loudness per word for emphasis; cheap (one decode at 16 kHz), and optional: a failure leaves words without it
    try:
        from faster_whisper import decode_audio

        for w, r in zip(words, word_rms(decode_audio(path, sampling_rate=16000), 16000, words)):
            w["rms"] = r
    except Exception:  # noqa: BLE001
        pass
    return {"language": info.language, "words": words, "durationMs": int(info.duration * 1000)}
