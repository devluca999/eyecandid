"""Render the edit model to MP4: Remotion cut (services/render) → voice clean-up + loudness → QC → upload.

Needs Node and the services/render package (EYELORE_RENDER_DIR, default: the repo checkout) plus ffmpeg.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

from ..qc import measure_file, needs_source, qc_file


def _render_dir() -> Path:
    env = os.environ.get("EYELORE_RENDER_DIR")
    if env:
        return Path(env)
    for parent in Path(__file__).resolve().parents:
        cand = parent / "services" / "render"
        if (cand / "src" / "index.ts").is_file():
            return cand
    raise RuntimeError("services/render not found; set EYELORE_RENDER_DIR")


def _lufs(path: str) -> float:
    err = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", path, "-af", "ebur128", "-f", "null", "-"], capture_output=True, text=True).stderr
    m = re.findall(r"I:\s+(-?[\d.]+) LUFS", err)
    return float(m[-1]) if m else -70.0


def run(inp: dict, ctx) -> dict:
    doc = inp["doc"]
    media = {c["mediaId"]: ctx.url(c["mediaId"]) for c in doc["clips"]}
    # generated b-roll stills over beads (ADR 0013): the Cut composition shows them with a slow push
    for item in doc.get("tracks", {}).get("broll", []):
        if item.get("ref") and item["ref"] not in media:
            media[item["ref"]] = ctx.url(item["ref"])
    work = Path(tempfile.mkdtemp(prefix="eyelore-render-"))
    props = work / "props.json"
    props.write_text(json.dumps({"doc": doc, "media": media, "watermark": inp["watermark"]}))
    raw = work / "cut.mp4"
    rdir = _render_dir()
    ctx.progress(0.05, "cutting")
    proc = subprocess.Popen(
        [str(rdir / "node_modules" / ".bin" / "remotion") if (rdir / "node_modules" / ".bin" / "remotion").exists() else "npx",
         *([] if (rdir / "node_modules" / ".bin" / "remotion").exists() else ["remotion"]),
         "render", "src/index.ts", "Cut", str(raw), f"--props={props}", "--log=info", "--concurrency=2"],
        cwd=rdir, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True,
    )
    tail: list[str] = []
    for line in proc.stdout or []:
        tail = (tail + [line])[-30:]
        m = re.search(r"Rendered (\d+)/(\d+)", line)
        if m:
            ctx.progress(0.05 + 0.75 * int(m.group(1)) / max(1, int(m.group(2))), "rendering")
    if proc.wait() != 0:
        raise RuntimeError("remotion render failed: " + "".join(tail)[-800:])

    # polish how it sounds, never what was said: gentle high-pass, light denoise, loudness to target
    ctx.progress(0.85, "balancing sound")
    out = work / "final.mp4"
    target = float(inp.get("loudnessLufs", -14))
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", str(raw), "-c:v", "copy",
         "-af", f"highpass=f=80,afftdn=nf=-25,loudnorm=I={target}:TP=-1.5:LRA=11", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", str(out)],
        check=True,
    )
    ctx.progress(0.92, "checking")
    qc = qc_file(str(out), sheet=False)
    lufs = _lufs(str(out))
    # the export quality check (packages/core qc.ts, run by Convex): measure the file; only when it shows black, a
    # freeze or clipping, measure the takes too, so a dark or still take isn't blamed on the render
    measure = measure_file(str(out))
    if needs_source(measure):
        ctx.progress(0.95, "checking the takes")
        measure["sources"] = {c["id"]: _strip(measure_file(media[c["mediaId"]])) for c in doc["clips"]}
    media_id = ctx.upload(str(out), "video/mp4", "render")
    return {
        "mediaId": media_id,
        "durationMs": int(float(qc.get("duration") or 0) * 1000),
        "qc": {"freezes": int(qc.get("freezes", 0)), "silentAudio": "near-silent audio" in qc["flags"] or "no audio track" in qc["flags"], "lufs": round(lufs, 1)},
        "measure": measure,
    }


def _strip(m: dict) -> dict:
    """A take's measure as the contract's FileMeasure (no duration)."""
    return {k: v for k, v in m.items() if k != "durationMs"}
