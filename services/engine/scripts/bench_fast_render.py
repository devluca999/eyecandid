"""Time the fast free render (ADR 0018) on this machine: the real render handler on a ~62 s 1080x1920 cut.

    python scripts/bench_fast_render.py [source.mp4]

Without a source it builds one from the landing loops in apps/web/public/media (real footage, more motion than a
talking head) with a pink-noise sound track. The plan is synthetic but shaped like an autocut edit: 22 kept
ranges with gaps, a punch-in on every third, a drifting face track, a caption every 1.5 s, the watermark.
"""
from __future__ import annotations

import json
import os
import resource
import shutil
import subprocess
import sys
import tempfile
import time
from pathlib import Path

from eyelore_engine import contract
from eyelore_engine.handlers import fast_render, render

REPO = Path(__file__).resolve().parents[3]
FPS, W, H = 30, 1080, 1920


def make_source(out: Path) -> None:
    loops = sorted((REPO / "apps/web/public/media").glob("*-720.mp4"))[:22]
    args = ["ffmpeg", "-v", "error", "-y"]
    for p in loops:
        args += ["-i", str(p)]
    args += ["-f", "lavfi", "-i", "anoisesrc=c=pink:a=0.1:d=70"]
    v = "".join(f"[{i}:v]fps={FPS},scale={W}:{H}:force_original_aspect_ratio=increase,crop={W}:{H},setsar=1[v{i}];" for i in range(len(loops)))
    v += "".join(f"[v{i}]" for i in range(len(loops))) + f"concat=n={len(loops)}:v=1:a=0[v]"
    args += ["-filter_complex", v, "-map", "[v]", "-map", f"{len(loops)}:a", "-t", "70", "-c:v", "libx264", "-preset", "veryfast", "-crf", "18", "-c:a", "aac", "-shortest", str(out)]
    subprocess.run(args, check=True)


def plan_and_sound() -> tuple[dict, list[dict]]:
    shots, sound, at, src = [], [], 0, 0
    for k in range(22):
        n = 70 + (k * 7) % 30  # 2.3 to 3.3 s kept, then a 0.17 s gap
        w = 0.892 if k % 3 == 0 else 1.0
        x0, x1 = (1 - w) / 2, (1 - w) / 2 + (0.02 if w < 1 else 0)
        shots.append({"mediaId": "m1", "srcFrame": src, "frames": n, "w": w, "h": w, "path": [{"f": 0, "x": x0, "y": (1 - w) / 2}, {"f": n - 1, "x": x1, "y": (1 - w) / 2}]})
        sound.append({"mediaId": "m1", "fromMs": src * 1000 / FPS, "toMs": (src + n) * 1000 / FPS, "atMs": at * 1000 / FPS, "fadeInMs": 15, "fadeOutMs": 15})
        at += n
        src += n + 5
    words = "make real people look great with a cut that keeps every word they said".split()
    caps = [{"from": f, "to": min(at, f + 45), "text": " ".join(words[(i * 3) % 10:(i * 3) % 10 + 4])} for i, f in enumerate(range(0, at, 45))]
    return {"width": W, "height": H, "fps": FPS, "frames": at, "shots": shots, "captions": caps, "captionAt": {"y": 0.64, "anchor": "top"}}, sound


def main() -> None:
    work = Path(tempfile.mkdtemp(prefix="eyelore-bench-"))
    src = Path(sys.argv[1]) if len(sys.argv) > 1 else work / "source.mp4"
    if not src.exists():
        t = time.perf_counter()
        make_source(src)
        print(f"source built in {time.perf_counter() - t:.1f}s")
    plan, sound = plan_and_sound()
    doc = {"schemaVersion": 1, "projectId": "bench", "version": 1, "clips": [{"id": "c1", "mediaId": "m1", "source": "upload", "w": W, "h": H, "durationMs": 70000, "fps": FPS}]}
    inp = {"doc": doc, "aspect": "9:16", "watermark": True, "sound": sound, "engine": "fast", "fast": plan}
    contract.validate_input("render", inp)
    marks: list = []
    t0 = time.perf_counter()

    class Ctx:
        def download(self, mid):
            return str(src)

        def url(self, mid):
            return str(src)

        def progress(self, p, stage=""):
            if not marks or marks[-1][1] != stage:
                marks.append((round(time.perf_counter() - t0, 2), stage))

        def upload(self, path, mime, kind):
            shutil.copy(path, work / "out.mp4")
            return "out"

    assert fast_render.available(), "ffmpeg lacks libass or libx264"
    r0 = resource.getrusage(resource.RUSAGE_CHILDREN)
    res = render.run(inp, Ctx())
    r1 = resource.getrusage(resource.RUSAGE_CHILDREN)
    contract.validate_output("render", res)
    ver = subprocess.run(["ffmpeg", "-version"], capture_output=True, text=True).stdout.splitlines()[0]
    print(json.dumps({
        "ffmpeg": ver, "cpus": os.cpu_count(), "output_s": plan["frames"] / FPS, "wall_s": round(time.perf_counter() - t0, 2),
        "child_cpu_s": round((r1.ru_utime - r0.ru_utime) + (r1.ru_stime - r0.ru_stime), 1), "stages": marks,
        "qc": res["qc"], "black": res["measure"]["black"], "frozen": res["measure"]["frozen"], "bytes": (work / "out.mp4").stat().st_size,
    }))


if __name__ == "__main__":
    main()
