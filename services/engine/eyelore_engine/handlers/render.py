"""Render the edit model to MP4: Remotion cut (services/render) → sound mix + voice clean-up + loudness → QC → upload.

Needs Node and the services/render package (EYELORE_RENDER_DIR, default: the repo checkout) plus ffmpeg.

Sound: when the job carries the sound plan (toTimeline().sound: J/L cuts, a fade at every cut), Remotion renders the
picture only and ffmpeg mixes the sound from the sources sample-accurately (Remotion applies volume per video frame,
which can't make a 15 ms fade). Without a plan (older apps) the renderer's own sound is used, as before.

Loudness: two-pass loudnorm to the target (default -14 LUFS integrated, -1 dBTP), measured through the same
high-pass and denoise chain it is applied with, linear where loudnorm can manage it.
"""
from __future__ import annotations

import json
import os
import re
import subprocess
import tempfile
from pathlib import Path

from ..qc import qc_file

TRUE_PEAK_DB = -1.0
LRA = 11
CLEANUP = "highpass=f=80,afftdn=nf=-25"


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


def sound_filter(pieces: list[dict], input_of: dict[str, int]) -> str:
    """ffmpeg filtergraph for the sound plan: each piece trimmed from its source, faded (half-sine, inside the kept
    range), then all of them back to back. Pieces tile the output (toTimeline), so concat is exact. Output label [snd]."""
    chains = []
    for k, p in enumerate(pieces):
        start, end = p["fromMs"] / 1000, p["toMs"] / 1000
        length = end - start
        f = [f"[{input_of[p['mediaId']]}:a]atrim=start={start:.4f}:end={end:.4f}", "asetpts=PTS-STARTPTS", "aresample=48000", "aformat=sample_fmts=fltp:channel_layouts=stereo"]
        if p.get("fadeInMs", 0) > 0:
            f.append(f"afade=t=in:st=0:d={p['fadeInMs'] / 1000:.4f}:curve=hsin")
        if p.get("fadeOutMs", 0) > 0:
            d = p["fadeOutMs"] / 1000
            f.append(f"afade=t=out:st={max(0.0, length - d):.4f}:d={d:.4f}:curve=hsin")
        chains.append(",".join(f) + f"[s{k}]")
    joined = "".join(f"[s{k}]" for k in range(len(pieces)))
    return ";".join(chains) + f";{joined}concat=n={len(pieces)}:v=0:a=1[snd]"


def parse_loudnorm(stderr: str) -> dict:
    """The JSON block loudnorm prints with print_format=json (the last {...} in stderr)."""
    m = re.findall(r"\{[^{}]*\"input_i\"[^{}]*\}", stderr, flags=re.S)
    if not m:
        raise RuntimeError("loudnorm printed no measurement")
    return json.loads(m[-1])


def loudnorm_pass2(measured: dict, target: float) -> str:
    """Second-pass loudnorm with the first pass's numbers (linear gain when the true-peak ceiling allows it)."""
    return (
        f"loudnorm=I={target}:TP={TRUE_PEAK_DB}:LRA={LRA}"
        f":measured_I={measured['input_i']}:measured_TP={measured['input_tp']}:measured_LRA={measured['input_lra']}"
        f":measured_thresh={measured['input_thresh']}:offset={measured['target_offset']}:linear=true:print_format=summary"
    )


_latency: int | None = None


def cleanup_latency() -> int:
    """Samples (at 48 kHz) the clean-up chain delays the sound by: afftdn works in FFT frames and shifts its output
    (~25 ms on ffmpeg 7/8), which would put the voice behind the lips. Measured once with an impulse, so it holds for
    whatever ffmpeg the host has."""
    global _latency
    if _latency is None:
        raw = subprocess.run(
            ["ffmpeg", "-v", "error", "-f", "lavfi", "-i", "aevalsrc='if(between(n,24000,24003),0.8,0)':s=48000:d=1.5", "-af", CLEANUP, "-f", "f32le", "-"],
            capture_output=True, check=True,
        ).stdout
        import array

        x = array.array("f")
        x.frombytes(raw)
        peak = max(range(len(x)), key=lambda i: abs(x[i])) if len(x) else 24000
        _latency = max(0, peak - 24001)
    return _latency


def _has_audio(path: str) -> bool:
    out = subprocess.run(["ffprobe", "-v", "error", "-select_streams", "a", "-show_entries", "stream=index", "-of", "csv=p=0", path], capture_output=True, text=True).stdout
    return bool(out.strip())


def mix_sound(pieces: list[dict], sources: dict[str, str], out: str) -> None:
    """Mix the sound plan from local source files into a 48 kHz stereo float WAV."""
    ids = list(dict.fromkeys(p["mediaId"] for p in pieces))
    args = ["ffmpeg", "-v", "error", "-y"]
    for mid in ids:
        args += ["-i", sources[mid]]
    graph = sound_filter(pieces, {mid: i for i, mid in enumerate(ids)})
    subprocess.run([*args, "-filter_complex", graph, "-map", "[snd]", "-c:a", "pcm_f32le", out], check=True)


def normalize(video: str, audio: str, out: str, target: float) -> dict:
    """Two-pass loudnorm of `audio` (through the clean-up chain), muxed with `video`'s picture."""
    if not _has_audio(audio):
        subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", video, "-c", "copy", "-movflags", "+faststart", out], check=True)
        return {}
    err = subprocess.run(["ffmpeg", "-hide_banner", "-nostats", "-i", audio, "-af", f"aresample=48000,{CLEANUP},loudnorm=I={target}:TP={TRUE_PEAK_DB}:LRA={LRA}:print_format=json", "-f", "null", "-"], capture_output=True, text=True).stderr
    measured = parse_loudnorm(err)
    finite = all(re.fullmatch(r"-?\d+(\.\d+)?", str(measured.get(k, ""))) for k in ("input_i", "input_tp", "input_lra", "input_thresh", "target_offset"))
    # silence measures -inf: nothing to normalise, keep the clean-up only
    lat = cleanup_latency()
    # undo the clean-up's delay so the sound stays on the lips (trim its head, pad its tail back to length)
    sync = f"atrim=start_sample={lat},asetpts=PTS-STARTPTS,apad=pad_len={lat}" if lat else "anull"
    chain = f"aresample=48000,{CLEANUP},{sync}"
    af = f"{chain},{loudnorm_pass2(measured, target)}" if finite else chain
    subprocess.run(
        ["ffmpeg", "-v", "error", "-y", "-i", video, "-i", audio, "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
         "-af", af, "-ar", "48000", "-c:a", "aac", "-b:a", "160k", "-movflags", "+faststart", out],
        check=True,
    )
    return measured


def run(inp: dict, ctx) -> dict:
    doc = inp["doc"]
    media = {c["mediaId"]: ctx.url(c["mediaId"]) for c in doc["clips"]}
    # generated b-roll stills over beads (ADR 0013): the Cut composition shows them with a slow push
    for item in doc.get("tracks", {}).get("broll", []):
        if item.get("ref") and item["ref"] not in media:
            media[item["ref"]] = ctx.url(item["ref"])
    work = Path(tempfile.mkdtemp(prefix="eyelore-render-"))
    pieces = inp.get("sound") or []
    sources: dict[str, str] = {}
    if pieces:
        sources = {mid: ctx.download(mid) for mid in dict.fromkeys(p["mediaId"] for p in pieces)}
        if not all(_has_audio(p) for p in sources.values()):
            pieces = []  # a source without sound: let the renderer handle it as before
    props = work / "props.json"
    props.write_text(json.dumps({"doc": doc, "media": media, "watermark": inp["watermark"], "audio": not pieces}))
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

    # polish how it sounds, never what was said: the cut's sound, gentle high-pass, light denoise, loudness to target
    ctx.progress(0.85, "balancing sound")
    audio = str(raw)
    if pieces:
        audio = str(work / "sound.wav")
        mix_sound(pieces, sources, audio)
    out = work / "final.mp4"
    target = float(inp.get("loudnessLufs", -14))
    normalize(str(raw), audio, str(out), target)
    ctx.progress(0.92, "checking")
    qc = qc_file(str(out), sheet=False)
    lufs = _lufs(str(out))
    media_id = ctx.upload(str(out), "video/mp4", "render")
    return {
        "mediaId": media_id,
        "durationMs": int(float(qc.get("duration") or 0) * 1000),
        "qc": {"freezes": int(qc.get("freezes", 0)), "silentAudio": "near-silent audio" in qc["flags"] or "no audio track" in qc["flags"], "lufs": round(lufs, 1)},
    }
