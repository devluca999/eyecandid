"""J/L sound plan mix, two-pass loudness, per-word rms (the worker's side of the taste heuristics)."""
import array
import math
import shutil
import subprocess

import pytest

from eyelore_engine import contract
from eyelore_engine.handlers import render, transcribe

LOUDNORM_STDERR = """
[Parsed_loudnorm_2 @ 0x1]
{
	"input_i" : "-27.61",
	"input_tp" : "-9.03",
	"input_lra" : "3.40",
	"input_thresh" : "-37.90",
	"output_i" : "-14.21",
	"output_tp" : "-1.00",
	"output_lra" : "2.90",
	"output_thresh" : "-24.50",
	"normalization_type" : "dynamic",
	"target_offset" : "0.21"
}
"""

PLAN = [
    {"mediaId": "m1", "fromMs": 300, "toMs": 1440, "atMs": 0, "fadeInMs": 15, "fadeOutMs": 15},
    {"mediaId": "m1", "fromMs": 1920, "toMs": 3000, "atMs": 1140, "fadeInMs": 15, "fadeOutMs": 15},
    {"mediaId": "m2", "fromMs": 200, "toMs": 1500, "atMs": 2220, "fadeInMs": 15, "fadeOutMs": 0},
]


def test_sound_filter_trims_fades_and_concats_every_piece():
    g = render.sound_filter(PLAN, {"m1": 0, "m2": 1})
    assert "[0:a]atrim=start=0.3000:end=1.4400" in g
    assert "afade=t=out:st=1.1250:d=0.0150:curve=hsin" in g  # 1.14 s piece, fade over its last 15 ms
    assert "[1:a]atrim=start=0.2000:end=1.5000" in g
    assert g.count("afade=t=in") == 3 and g.count("afade=t=out") == 2
    assert g.endswith("[s0][s1][s2]concat=n=3:v=0:a=1[snd]")


def test_loudnorm_two_pass_args():
    m = render.parse_loudnorm("noise before\n" + LOUDNORM_STDERR + "\nafter")
    assert m["input_i"] == "-27.61"
    a = render.loudnorm_pass2(m, -14)
    assert a.startswith("loudnorm=I=-14:TP=-1.0:LRA=11:")
    assert "measured_I=-27.61:measured_TP=-9.03:measured_LRA=3.40:measured_thresh=-37.90:offset=0.21:linear=true" in a
    with pytest.raises(RuntimeError):
        render.parse_loudnorm("no json here")


def test_contract_render_input_takes_the_sound_plan_optionally():
    doc = {"schemaVersion": 1, "projectId": "p", "version": 1}
    contract.validate_input("render", {"doc": doc, "aspect": "9:16", "watermark": True, "sound": PLAN})
    contract.validate_input("render", {"doc": doc, "aspect": "9:16", "watermark": True})


def test_word_rms_relative_to_the_median_word():
    sr = 16000
    x = [(0.4 if sr <= i < 2 * sr else 0.1) * math.sin(i / 3) for i in range(sr * 3)]
    words = [{"startMs": 0, "endMs": 500}, {"startMs": 1200, "endMs": 1700}, {"startMs": 2200, "endMs": 2700}, {"startMs": 5000, "endMs": 5200}]
    r = transcribe.word_rms(x, sr, words)
    assert r[0] == 1 and r[2] == 1 and r[3] == 0
    assert abs(r[1] - 4) < 0.1
    assert transcribe.word_rms([0.0] * 100, sr, [{"startMs": 0, "endMs": 5}]) == [0.0]
    out = {"language": "en", "durationMs": 3000, "words": [{"text": "hi", "startMs": 0, "endMs": 500, "conf": 1.0, "rms": r[0]}]}
    contract.validate_output("transcribe", out)
    del out["words"][0]["rms"]
    contract.validate_output("transcribe", out)  # older workers: still valid


def _pcm(path: str) -> array.array:
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-ac", "1", "-ar", "48000", "-f", "f32le", "-"], capture_output=True, check=True).stdout
    a = array.array("f")
    a.frombytes(raw)
    return a


@pytest.mark.skipif(shutil.which("ffmpeg") is None, reason="needs ffmpeg")
def test_mix_is_click_free_and_lands_at_minus_14(tmp_path):
    # a 440 Hz tone at -26 dBFS; the plan's cuts land mid-cycle, so a hard splice would jump
    src = tmp_path / "tone.wav"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "sine=f=440:r=48000:d=4", "-af", "volume=-20dB", "-ac", "2", str(src)], check=True)
    plan = [
        {"mediaId": "m1", "fromMs": 0, "toMs": 1003, "atMs": 0, "fadeInMs": 15, "fadeOutMs": 15},
        {"mediaId": "m1", "fromMs": 2001, "toMs": 3500, "atMs": 1003, "fadeInMs": 15, "fadeOutMs": 15},
    ]
    wav = tmp_path / "sound.wav"
    render.mix_sound(plan, {"m1": str(src)}, str(wav))
    x = _pcm(str(wav))
    assert abs(len(x) - 48000 * 2.502) < 48 * 2  # duration = sum of pieces
    body = max(abs(x[i + 1] - x[i]) for i in range(5000, 40000))
    cut = int(1.003 * 48000)
    at_cut = max(abs(x[i + 1] - x[i]) for i in range(cut - 480, cut + 480))
    assert at_cut <= body * 1.05
    # negative control: the same splice without fades jumps
    hard = tmp_path / "hard.wav"
    render.mix_sound([{**p, "fadeInMs": 0, "fadeOutMs": 0} for p in plan], {"m1": str(src)}, str(hard))
    y = _pcm(str(hard))
    assert max(abs(y[i + 1] - y[i]) for i in range(cut - 48, cut + 48)) > body * 3

    # two-pass loudnorm on a picture + this sound: -14 LUFS integrated, true peak under -1 dBTP
    video = tmp_path / "v.mp4"
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "color=c=gray:s=320x240:r=30:d=2.5", "-c:v", "libx264", "-pix_fmt", "yuv420p", str(video)], check=True)
    out = tmp_path / "final.mp4"
    m = render.normalize(str(video), str(wav), str(out), -14)
    assert float(m["input_i"]) < -20
    assert abs(render._lufs(str(out)) + 14) < 1.0
