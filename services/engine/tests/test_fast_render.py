"""The fast free render (ADR 0018): the ffmpeg graph built from core's fastPlan, the captions .ass, and a real render
when the host's ffmpeg can burn subtitles."""
import json
import re
import shutil
import subprocess
from pathlib import Path

import pytest

from eyelore_engine import contract, qc
from eyelore_engine.handlers import fast_render, render

FIX = Path(__file__).parent / "fixtures"

# 9:16 from a 1080x1920 take: a plain shot, a J/L-led shot further on, a punched-in shot (smaller crop) right after it,
# then a jump back (a reordered bead) which needs its own decoder
PLAN = {
    "width": 1080,
    "height": 1920,
    "fps": 30,
    "frames": 150,
    "shots": [
        {"mediaId": "m1", "srcFrame": 0, "frames": 40, "w": 1, "h": 1, "path": [{"f": 0, "x": 0, "y": 0}]},
        {"mediaId": "m1", "srcFrame": 52, "frames": 30, "w": 1, "h": 1, "path": [{"f": 0, "x": 0, "y": 0}]},
        {"mediaId": "m1", "srcFrame": 82, "frames": 40, "w": 0.869565, "h": 0.869565, "path": [{"f": 0, "x": 0.05, "y": 0.04}, {"f": 39, "x": 0.08, "y": 0.06}]},
        {"mediaId": "m1", "srcFrame": 10, "frames": 40, "w": 1, "h": 1, "path": [{"f": 0, "x": 0, "y": 0}]},
    ],
    "captions": [
        {"from": 0, "to": 40, "text": "So you can see how recovered you are before you train."},
        {"from": 40, "to": 90, "text": "it's {not} a \\N tag"},
    ],
    "captionAt": {"y": 0.64, "anchor": "top"},
}


def test_runs_share_a_decoder_going_forward_and_split_on_a_jump_back():
    assert fast_render.runs(PLAN["shots"]) == [[0, 1, 2], [3]]
    other = [dict(PLAN["shots"][0]), dict(PLAN["shots"][1], mediaId="m2")]
    assert fast_render.runs(other) == [[0], [1]]


def test_picture_args_trim_each_shot_on_the_frame_grid_and_concat_in_order():
    args = fast_render.picture_args(PLAN, {"m1": "take.mp4"}, "captions.ass", "cut.mp4")
    graph = args[args.index("-filter_complex") + 1]
    # run 0 seeks to frame 0, run 1 to 30 frames before frame 10 (clamped at 0)
    assert args.count("-i") == 2
    assert graph.startswith("[0:v]fps=30,split=3[r0s0][r0s1][r0s2];")
    # shot 1 is source frames 52..81: trimmed on half-frame edges so exactly those frames survive
    assert f"[r0s1]trim=start={51.5 / 30:.6f}:end={81.5 / 30:.6f},setpts=PTS-STARTPTS," in graph
    # J/L leads are already in the plan's frame ranges: shot 0 ends at 40, shot 1 starts at 52 (a cut gap of 12)
    assert f"[r0s0]trim=start=0.000000:end={39.5 / 30:.6f}," in graph
    # the punched shot scales the source up to its box (1080/0.869565 = 1242 px wide) and crops the frame out of it,
    # its corner following the path in whole output pixels
    assert "scale=1242:2208:flags=bicubic:out_range=tv,crop=w=1080:h=1920:x=floor((if(lt(n\\,39)\\,0.050000+0.00076923*(n-0)\\,0.080000))*1242+0.5):" in graph
    assert graph.count("scale=1080:1920:flags=bicubic:out_range=tv,setsar=1") == 3  # unpunched: no crop at all
    assert graph.count("crop=") == 1
    assert "[v0][v1][v2][v3]concat=n=4:v=1:a=0" in graph
    # never shorter than Remotion's durationInFrames
    assert "tpad=stop_mode=clone" in graph and "trim=end_frame=150" in graph
    assert ",subtitles=filename=captions.ass:fontsdir=fonts,split=2[pic][det];" in graph
    # the QC's picture measurements ride along on the encoded frames: no second decode of the file
    assert graph.endswith("[det]blackdetect@m=d=0.1:pic_th=0.98:pix_th=0.1,freezedetect@m=n=0.0005:d=0.2,freezedetect@q=n=0.003:d=1.5,nullsink")
    assert args[args.index("-c:v") + 1] == "libx264" and "-an" in args


def test_a_constant_path_is_a_constant_crop():
    assert fast_render._lerp_expr([{"f": 0, "x": 0.25, "y": 0}], "x") == "0.250000"
    e = fast_render._lerp_expr([{"f": 0, "x": 0.1, "y": 0}, {"f": 10, "x": 0.1, "y": 0}, {"f": 20, "x": 0.3, "y": 0}], "x")
    assert e == "if(lt(n\\,10)\\,0.100000\\,if(lt(n\\,20)\\,0.100000+0.02000000*(n-10)\\,0.300000))"


def test_captions_wrap_like_the_browser_and_sit_on_the_css_baseline():
    em = fast_render.CAPTION_EM * 1080
    width = 1080 * 0.88
    lines = fast_render.wrap("So you can see how recovered you are before you train.", em, width)
    assert len(lines) == 2
    # greedy: every line fits, and the next line's first word would not have
    assert all(fast_render.text_width(t, em) <= width for t in lines)
    assert fast_render.text_width(lines[0] + " " + lines[1].split()[0], em) > width
    assert fast_render.wrap("short", em, width) == ["short"]
    ass = fast_render.ass_script(PLAN, watermark=True)
    assert "PlayResX: 1080" in ass and "PlayResY: 1920" in ass
    assert ",Geist," in ass and "Geist Medium" in ass
    lines = [l for l in ass.splitlines() if l.startswith("Dialogue: 1,") and ",Cap," in l]
    assert len(lines) == 3  # two lines for the first chunk, one for the second
    # first line: CSS line box top at 64%, baseline (26-1.3*22)/2 + 1.005*22 design px below it; libass anchors the
    # bottom of its box, one win descent under the baseline
    s = 1080 / 390
    baseline = 0.64 * 1920 + (26 * s - 1.3 * 22 * s) / 2 + 1.005 * 22 * s
    y = float(re.search(r"\\pos\(540\.0,([\d.]+)\)", lines[0]).group(1))
    assert y == pytest.approx(baseline + 0.262 * 22 * s, abs=0.1)
    y2 = float(re.search(r"\\pos\(540\.0,([\d.]+)\)", lines[1]).group(1))
    assert y2 - y == pytest.approx(26 * s, abs=0.1)  # CSS line height, not libass's
    # frame edges: chunk 2 shows from frame 40 (1.333 s) up to frame 90 (3.0 s)
    assert lines[2].startswith("Dialogue: 1,0:00:01.33,0:00:03.00,Cap")
    # user text can't open an override block
    assert "{not}" not in ass and "\\N tag" not in ass
    assert "eyecandid" in ass and "\\an3" in ass


def test_middle_anchor_centres_the_block():
    plan = dict(PLAN, captionAt={"y": 0.5, "anchor": "middle"}, captions=[{"from": 0, "to": 10, "text": "one line"}])
    ass = fast_render.ass_script(plan, watermark=False)
    s = 1080 / 390
    y = float(re.search(r"Dialogue: 1,.*\\pos\(540\.0,([\d.]+)\)", ass).group(1))
    assert y == pytest.approx(960 - 13 * s + (26 * s - 1.3 * 22 * s) / 2 + 1.005 * 22 * s + 0.262 * 22 * s, abs=0.1)
    assert "eyecandid" not in ass


def test_contract_takes_the_fast_engine_and_still_takes_old_jobs():
    doc = {"schemaVersion": 1, "projectId": "p", "version": 1}
    contract.validate_input("render", {"doc": doc, "aspect": "9:16", "watermark": True, "engine": "fast", "fast": PLAN})
    contract.validate_input("render", {"doc": doc, "aspect": "9:16", "watermark": True})
    with pytest.raises(Exception):
        contract.validate_input("render", {"doc": doc, "aspect": "9:16", "watermark": True, "engine": "warp"})


def test_fonts_ship_with_the_package():
    assert (fast_render.FONTS / "Geist-Bold.ttf").is_file() and (fast_render.FONTS / "Geist-Medium.ttf").is_file()
    assert "Open Font License" in (fast_render.FONTS / "OFL.txt").read_text()


needs_libass = pytest.mark.skipif(not fast_render.available(), reason="ffmpeg without libass/libx264")


@needs_libass
def test_renders_the_plan_frame_exact(tmp_path):
    src = str(FIX / "talk.mp4")
    plan = json.loads(json.dumps(PLAN))
    # talk.mp4 is a 640x360 take: a 9:16 crop of it (cropped first, then scaled), then a punch-in (scaled first)
    plan["shots"] = [
        {"mediaId": "m1", "srcFrame": 0, "frames": 40, "w": 0.316406, "h": 1, "path": [{"f": 0, "x": 0.3, "y": 0}, {"f": 39, "x": 0.35, "y": 0}]},
        {"mediaId": "m1", "srcFrame": 45, "frames": 30, "w": 0.9, "h": 0.9, "path": [{"f": 0, "x": 0.05, "y": 0.05}]},
    ]
    plan["frames"] = 70
    out, log = fast_render.render_picture(plan, {"m1": src}, True, tmp_path)
    probe = json.loads(subprocess.run(["ffprobe", "-v", "error", "-count_frames", "-show_streams", "-of", "json", out], capture_output=True, text=True, check=True).stdout)
    v = probe["streams"][0]
    assert (v["codec_name"], v["width"], v["height"], v["pix_fmt"]) == ("h264", 1080, 1920, "yuv420p")
    assert int(v["nb_read_frames"]) == 70
    assert len(probe["streams"]) == 1  # picture only; render.run muxes the finished sound in
    video_log, freezes = fast_render.picture_measure(log)
    m = qc.parse_detect(video_log, 70 / 30)
    assert m["black"] == [] and freezes == 0
    # libass resolved both styles to the shipped Geist files, not a system fallback
    sel = subprocess.run(
        ["ffmpeg", "-hide_banner", "-v", "verbose", "-f", "lavfi", "-i", "color=black:s=1080x1920:d=0.5", "-vf", "subtitles=filename=captions.ass:fontsdir=fonts", "-f", "null", "-"],
        cwd=tmp_path, capture_output=True, text=True,
    ).stderr
    picked = set(re.findall(r"fontselect: \(([^)]*)\) -> ([^,]+),", sel))
    assert ("Geist, 700, 0", "Geist-Bold") in picked
    assert ("Geist Medium, 400, 0", "Geist-Medium") in picked


def test_picture_measure_splits_the_two_freeze_detectors():
    log = "\n".join([
        "[blackdetect@m @ 0x1] black_start:1.2 black_end:1.5 black_duration:0.3",
        "[freezedetect@m @ 0x2] lavfi.freezedetect.freeze_start: 2",
        "[freezedetect@q @ 0x3] lavfi.freezedetect.freeze_start: 2",
        "[freezedetect@m @ 0x2] lavfi.freezedetect.freeze_end: 4",
        "[libx264 @ 0x4] frame I:2 Avg QP:20",
    ])
    video_log, freezes = fast_render.picture_measure(log)
    assert freezes == 1
    m = qc.parse_detect(video_log, 5.0)
    assert m["black"] == [{"startMs": 1200, "endMs": 1500}]
    assert m["frozen"] == [{"startMs": 2000, "endMs": 4000}]


def test_a_landscape_take_in_9_16_is_cropped_before_it_is_scaled():
    plan = dict(PLAN, shots=[{"mediaId": "m1", "srcFrame": 0, "frames": 150, "w": 0.316406, "h": 1, "path": [{"f": 0, "x": 0.3, "y": 0}]}])
    args = fast_render.picture_args(plan, {"m1": "wide.mp4"}, None, "cut.mp4")
    graph = args[args.index("-filter_complex") + 1]
    assert "crop=w=iw*0.316406:h=ih*1.000000:x=iw*(0.300000):y=ih*(0.000000),scale=1080:1920:flags=bicubic:out_range=tv" in graph
