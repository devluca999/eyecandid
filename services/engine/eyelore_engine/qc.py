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
