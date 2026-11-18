"""Technical QC for rendered video, ported from legacy-engine/worker.py (qc_file)."""
from __future__ import annotations

import json
import re
import subprocess


def _ff(args: list[str]) -> subprocess.CompletedProcess:
    return subprocess.run(args, capture_output=True, text=True)


def qc_file(path: str, sheet: bool = True) -> dict:
    r: dict = {}
    flags: list[str] = []
    pr = json.loads(_ff(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type,width,height:format=duration", "-of", "json", path]).stdout or "{}")
    streams = pr.get("streams", [])
    v = next((s for s in streams if s.get("codec_type") == "video"), {})
    dur = float(pr.get("format", {}).get("duration", 0) or 0)
    r.update(width=v.get("width"), height=v.get("height"), duration=round(dur, 2), audio=any(s.get("codec_type") == "audio" for s in streams))
    freezes = 0
    if dur > 0 and v:
        if sheet:
            _ff(["ffmpeg", "-v", "error", "-y", "-i", path, "-vf", f"fps={6 / dur:.4f},scale=320:-2,tile=6x1", "-frames:v", "1", path.rsplit(".", 1)[0] + "_sheet.jpg"])
        freezes = _ff(["ffmpeg", "-i", path, "-vf", "freezedetect=n=0.003:d=1.5", "-map", "0:v:0", "-f", "null", "-"]).stderr.count("freeze_start")
        if freezes:
            flags.append("frozen video")
    if not r["audio"]:
        flags.append("no audio track")
    m = re.search(r"mean_volume: (-?[\d.]+) dB", _ff(["ffmpeg", "-i", path, "-af", "volumedetect", "-vn", "-f", "null", "-"]).stderr)
    if m:
        r["mean_db"] = float(m.group(1))
        if r["mean_db"] < -50:
            flags.append("near-silent audio")
    r["freezes"] = freezes
    r["flags"] = flags
    return r


# ── measurements for the export quality check (packages/core qc.ts decides; this only measures) ──
#
# One decode pass per file: blackdetect and freezedetect with short minimum durations (qc.ts applies the real
# thresholds), astats on the sound clamped to 16-bit so a sample past full scale reads as clipped.
DETECT_VF = "blackdetect=d=0.1:pic_th=0.98:pix_th=0.1,freezedetect=n=0.0005:d=0.2"
DETECT_AF = "aformat=sample_fmts=s16,astats=measure_perchannel=none"
SILENCE_DB = -120.0

_NUM = r"(-?(?:[\d.]+|inf))"


def _db(s: str) -> float:
    v = float(s)
    return SILENCE_DB if v == float("-inf") or v < SILENCE_DB else round(v, 2)


def _ms(s: str) -> int:
    return max(0, int(round(float(s) * 1000)))


def parse_detect(stderr: str, duration_s: float) -> dict:
    """ffmpeg's stderr (DETECT_VF / DETECT_AF) → {black, frozen, audio?} in ms. A freeze still open at the end of the
    file runs to the end. No astats summary (no audio stream) → no `audio`."""
    end_ms = _ms(str(duration_s))
    black = [{"startMs": _ms(a), "endMs": _ms(b)} for a, b in re.findall(r"black_start:\s*([\d.]+)\s+black_end:\s*([\d.]+)", stderr)]
    frozen: list[dict] = []
    start: int | None = None
    for kind, val in re.findall(r"lavfi\.freezedetect\.freeze_(start|end):\s*([\d.]+)", stderr):
        if kind == "start":
            start = _ms(val)
        elif start is not None:
            frozen.append({"startMs": start, "endMs": _ms(val)})
            start = None
    if start is not None:
        frozen.append({"startMs": start, "endMs": max(start, end_ms)})
    out: dict = {"black": black, "frozen": frozen}
    overall = stderr.split("Overall", 1)[1] if "Overall" in stderr else ""
    peak = re.search(r"Peak level dB:\s*" + _NUM, overall)
    rms = re.search(r"RMS level dB:\s*" + _NUM, overall)
    if peak and rms:
        count = re.search(r"\] Peak count:\s*([\d.]+)", overall)
        samples = re.search(r"Number of samples:\s*([\d.]+)", overall)
        peak_db = _db(peak.group(1))
        # astats counts the times the signal reached its peak; at full scale that is the clipped share
        ratio = float(count.group(1)) / float(samples.group(1)) if peak_db > -0.1 and count and samples and float(samples.group(1)) > 0 else 0.0
        out["audio"] = {"peakDb": peak_db, "rmsDb": _db(rms.group(1)), "clippedRatio": round(min(1.0, ratio), 6)}
    return out


def measure_file(src: str) -> dict:
    """Measure a file or URL in one decode pass: {durationMs, black, frozen, audio?}."""
    pr = json.loads(_ff(["ffprobe", "-v", "error", "-show_entries", "stream=codec_type:format=duration", "-of", "json", src]).stdout or "{}")
    dur = float(pr.get("format", {}).get("duration", 0) or 0)
    has_audio = any(s.get("codec_type") == "audio" for s in pr.get("streams", []))
    args = ["ffmpeg", "-hide_banner", "-nostats", "-i", src, "-vf", DETECT_VF]
    args += ["-af", DETECT_AF] if has_audio else ["-an"]
    err = _ff([*args, "-f", "null", "-"]).stderr
    return {"durationMs": _ms(str(dur)), **parse_detect(err, dur)}


def needs_source(m: dict, clip_peak_db: float = -0.3) -> bool:
    """Did the export show anything a take could explain (black, a freeze, clipping)? Only then are the takes measured."""
    a = m.get("audio")
    return bool(m["black"] or m["frozen"] or (a and (a["peakDb"] > clip_peak_db or a["clippedRatio"] > 0.001)))
