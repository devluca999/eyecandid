"""The fast free render (ADR 0017): the Cut composition's picture, captions and watermark drawn by one ffmpeg graph.

The plan comes from packages/core fastPlan (the job's `fast` field), so nothing here re-derives the edit: shots are
source frame ranges on the 30 fps grid with a crop that follows the reframe track (punch-ins split a shot, since a
crop's size is fixed), captions are output frame ranges. This module only turns that plan into ffmpeg arguments.

Captions are burned with libass from a generated .ass file in Geist (OFL, shipped in ./fonts). Lines are broken here
the way the browser breaks them (greedy, by Geist Bold advance widths, inside the 6% side margins) and each line is
placed on the baseline CSS would give it, so position and line height match Cut.tsx rather than libass's own layout.
"""
from __future__ import annotations

import functools
import re
import shutil
import subprocess
from pathlib import Path

FONTS = Path(__file__).resolve().parent.parent / "fonts"

# Geist (1000 units/em): hhea ascent 1005, descent 295 (what CSS lays out with), OS/2 win 1088/262 (what libass sizes by)
ASC, DESC = 1.005, 0.295
WIN_ASC, WIN_DESC = 1.088, 0.262
# Geist Bold advance widths for ASCII 32..126 (fontTools, Geist 1.9.2), in units of 1/1000 em
_ADV = [int(v) for v in (
    "228,257,390,589,670,825,706,203,323,323,422,570,236,417,236,522,693,449,653,650,656,671,627,544,664,631,311,311,"
    "550,552,550,591,962,730,703,734,716,622,604,738,721,300,627,689,589,915,750,776,672,769,697,681,599,703,730,1015,"
    "688,631,594,390,501,390,461,561,278,594,634,598,634,605,447,634,611,281,331,647,313,900,611,618,634,634,425,570,"
    "445,607,609,849,650,586,583,408,294,408,523"
).split(",")]
_ADV_DEFAULT = 620  # anything outside ASCII: about an average letter

# Cut.tsx: captions 700 22/26 at a 390 px phone width scaled to the frame, white, two soft shadows; left/right 6%
CAPTION_EM, CAPTION_LINE, CAPTION_SIDE = 22 / 390, 26 / 390, 0.06
# watermark: 500 34px (not scaled), white at 80%, right 4%, bottom 3%
MARK_EM, MARK_RIGHT, MARK_BOTTOM = 34, 0.04, 0.03


def text_width(text: str, em: float) -> float:
    return sum(_ADV[ord(c) - 32] if 32 <= ord(c) <= 126 else _ADV_DEFAULT for c in text) * em / 1000


def wrap(text: str, em: float, width: float) -> list[str]:
    """Greedy line breaking at spaces, as a browser does for a block of `width` px. A word too long stays whole."""
    lines: list[str] = []
    cur = ""
    for word in text.split():
        cand = f"{cur} {word}" if cur else word
        if cur and text_width(cand, em) > width:
            lines.append(cur)
            cur = word
        else:
            cur = cand
    if cur:
        lines.append(cur)
    return lines or [""]


def _ass_text(s: str) -> str:
    """Literal text for a dialogue line: braces and backslashes would start override tags."""
    return s.replace("\\", "⧵").replace("{", "❴").replace("}", "❵")


def _ts(frame: int, fps: int) -> str:
    """ASS time (centiseconds) for an event edge at output frame `frame`: floor, so it lands after the previous
    frame and on or before this one (libass shows an event while start <= t < end)."""
    cs = (frame * 100) // fps
    h, rem = divmod(cs, 360000)
    m, rem = divmod(rem, 6000)
    s, c = divmod(rem, 100)
    return f"{h}:{m:02d}:{s:02d}.{c:02d}"


def ass_script(plan: dict, watermark: bool) -> str:
    """The .ass file: one event per caption line on the baseline Cut.tsx's CSS gives it, a blurred layer under each
    for the wide soft shadow, and the watermark over the whole cut."""
    W, H, fps = plan["width"], plan["height"], plan["fps"]
    em, lh = CAPTION_EM * W, CAPTION_LINE * W
    size = em * (WIN_ASC + WIN_DESC)  # libass's font size is the win ascent + descent
    head = [
        "[Script Info]",
        "ScriptType: v4.00+",
        f"PlayResX: {W}",
        f"PlayResY: {H}",
        "WrapStyle: 2",
        "ScaledBorderAndShadow: yes",
        "YCbCr Matrix: None",
        "",
        "[V4+ Styles]",
        "Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding",
        # crisp text with the tight shadow (0 1px 2px at 45%)
        f"Style: Cap,Geist,{size:.2f},&H00FFFFFF,&H00FFFFFF,&H00000000,&H8C000000,-1,0,0,0,100,100,0,0,1,0,1,2,0,0,0,1",
        # the wide soft shadow (0 2px 12px at 35%), drawn under it
        f"Style: Soft,Geist,{size:.2f},&HA6000000,&HA6000000,&HFF000000,&HFF000000,-1,0,0,0,100,100,0,0,1,0,0,2,0,0,0,1",
        f"Style: Mark,Geist Medium,{MARK_EM * (WIN_ASC + WIN_DESC):.2f},&H33FFFFFF,&H33FFFFFF,&H00000000,&H99000000,0,0,0,0,100,100,0,0,1,0,1,3,0,0,0,1",
        "",
        "[Events]",
        "Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text",
    ]
    ev: list[str] = []
    at = plan["captionAt"]
    for c in plan["captions"]:
        lines = wrap(c["text"], em, W * (1 - 2 * CAPTION_SIDE))
        block_top = at["y"] * H - (len(lines) * lh / 2 if at["anchor"] == "middle" else 0)
        start, end = _ts(c["from"], fps), _ts(c["to"], fps)
        for i, line in enumerate(lines):
            baseline = block_top + i * lh + (lh - (ASC + DESC) * em) / 2 + ASC * em
            y = baseline + WIN_DESC * em  # \an2 anchors libass's line box bottom: baseline + win descent
            t = _ass_text(line)
            ev.append(f"Dialogue: 0,{start},{end},Soft,,0,0,0,,{{\\an2\\pos({W / 2:.1f},{y + 2:.1f})\\blur6}}{t}")
            ev.append(f"Dialogue: 1,{start},{end},Cap,,0,0,0,,{{\\an2\\pos({W / 2:.1f},{y:.1f})}}{t}")
    if watermark:
        # CSS: a 1.3 em line box whose bottom sits 3% up; its baseline is one hhea descent above that
        y = (1 - MARK_BOTTOM) * H - DESC * MARK_EM + WIN_DESC * MARK_EM
        ev.append(f"Dialogue: 2,{_ts(0, fps)},{_ts(plan['frames'] + fps, fps)},Mark,,0,0,0,,{{\\an3\\pos({(1 - MARK_RIGHT) * W:.1f},{y:.1f})}}eyecandid")
    return "\n".join(head + ev) + "\n"


def _lerp_expr(path: list[dict], key: str) -> str:
    """Piecewise-linear expression of the frame number `n` through the path's (f, key) points."""
    pts = [(p["f"], p[key]) for p in path]
    expr = f"{pts[-1][1]:.6f}"
    for (f0, v0), (f1, v1) in reversed(list(zip(pts, pts[1:]))):
        seg = f"{v0:.6f}" if abs(v1 - v0) < 1e-7 else f"{v0:.6f}+{(v1 - v0) / (f1 - f0):.8f}*(n-{f0})"
        expr = f"if(lt(n\\,{f1})\\,{seg}\\,{expr})"
    return expr


def runs(shots: list[dict]) -> list[list[int]]:
    """Group shots into decode runs: consecutive shots of one media going forward through it share one decoder (a
    split, then a trim per shot, with nothing buffered). A jump back or another media starts a new run."""
    out: list[list[int]] = []
    for i, s in enumerate(shots):
        if out:
            prev = shots[out[-1][-1]]
            if prev["mediaId"] == s["mediaId"] and s["srcFrame"] >= prev["srcFrame"] + prev["frames"] - 2:
                out[-1].append(i)
                continue
        out.append([i])
    return out


# seek this many frames before a run's first frame, so the accurate seek never lands on the frame we need
_PREROLL = 30


def picture_args(plan: dict, sources: dict[str, str], ass: str | None, out: str, threads: int = 0) -> list[str]:
    """The ffmpeg command for the picture: one input per run, shots cropped and scaled to the frame, concatenated,
    captions and watermark burned, H.264 (no sound; the sound plan is mixed and muxed by render.normalize)."""
    W, H, fps = plan["width"], plan["height"], plan["fps"]
    shots = plan["shots"]
    args = ["ffmpeg", "-hide_banner", "-v", "error", "-y", "-nostdin"]
    chains: list[str] = []
    labels: list[str] = []
    for r, idx in enumerate(runs(shots)):
        first, last = shots[idx[0]], shots[idx[-1]]
        s0 = max(0, first["srcFrame"] - _PREROLL)
        end = last["srcFrame"] + last["frames"]
        args += ["-ss", f"{s0 / fps:.6f}", "-t", f"{(end - s0 + _PREROLL) / fps:.6f}", "-i", sources[first["mediaId"]]]
        chains.append(f"[{r}:v]fps={fps},split={len(idx)}" + "".join(f"[r{r}s{i}]" for i in idx) if len(idx) > 1 else f"[{r}:v]fps={fps}[r{r}s{idx[0]}]")
        for i in idx:
            s = shots[i]
            a = (s["srcFrame"] - s0 - 0.5) / fps
            b = (s["srcFrame"] + s["frames"] - s0 - 0.5) / fps
            crop = f"crop=w=iw*{s['w']:.6f}:h=ih*{s['h']:.6f}:x=iw*({_lerp_expr(s['path'], 'x')}):y=ih*({_lerp_expr(s['path'], 'y')})"
            chains.append(f"[r{r}s{i}]trim=start={max(0.0, a):.6f}:end={b:.6f},setpts=PTS-STARTPTS,{crop},scale={W}:{H}:flags=bicubic:out_range=tv,setsar=1,format=yuv420p[v{i}]")
            labels.append(f"[v{i}]")
    total = plan["frames"]
    tail = f"{''.join(labels)}concat=n={len(labels)}:v=1:a=0,tpad=stop_mode=clone:stop_duration={2 * total / fps:.3f},trim=end_frame={total},setpts=N/({fps}*TB)"
    if ass:
        tail += f",subtitles=filename={ass}:fontsdir=fonts"
    chains.append(tail + "[pic]")
    args += ["-filter_complex", ";".join(chains), "-map", "[pic]", "-an", "-r", str(fps)]
    args += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-color_range", "tv"]
    if threads:
        args += ["-threads", str(threads)]
    args += ["-movflags", "+faststart", out]
    return args


@functools.lru_cache(maxsize=1)
def available() -> bool:
    """The fast path needs ffmpeg with libx264 and libass (the subtitles filter); without them, Remotion renders."""
    if not shutil.which("ffmpeg"):
        return False
    filters = subprocess.run(["ffmpeg", "-hide_banner", "-filters"], capture_output=True, text=True).stdout
    encoders = subprocess.run(["ffmpeg", "-hide_banner", "-encoders"], capture_output=True, text=True).stdout
    return bool(re.search(r"\ssubtitles\s", filters)) and "libx264" in encoders


def render_picture(plan: dict, sources: dict[str, str], watermark: bool, work: Path, progress=None, threads: int = 0) -> str:
    """Render the plan's picture into work/cut.mp4 and return its path."""
    shutil.copytree(FONTS, work / "fonts", dirs_exist_ok=True)
    ass = None
    if plan["captions"] or watermark:
        (work / "captions.ass").write_text(ass_script(plan, watermark), encoding="utf-8")
        ass = "captions.ass"
    out = work / "cut.mp4"
    args = picture_args(plan, sources, ass, str(out), threads)
    args[1:1] = ["-progress", "pipe:1", "-stats_period", "0.5"]
    proc = subprocess.Popen(args, cwd=work, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
    total = max(1, plan["frames"])
    for line in proc.stdout or []:
        m = re.match(r"frame=(\d+)", line)
        if m and progress:
            progress(int(m.group(1)) / total)
    err = proc.stderr.read() if proc.stderr else ""
    if proc.wait() != 0:
        raise RuntimeError("ffmpeg fast render failed: " + err[-800:])
    return str(out)
