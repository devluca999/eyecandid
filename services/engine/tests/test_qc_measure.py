"""Export quality check, worker side: ffmpeg's stderr → the render job's `measure`, and the qc_failed path.

The stderr fixtures in tests/fixtures/ffmpeg/ are real ffmpeg 9 output of DETECT_VF/DETECT_AF on small generated files
(see each test). The thresholds live in packages/core qc.ts; this side only measures.
"""
import json
import shutil
import subprocess
from pathlib import Path

import httpx
import pytest

from eyelore_engine import contract
from eyelore_engine.qc import SILENCE_DB, measure_file, needs_source, parse_detect

FIX = Path(__file__).parent / "fixtures" / "ffmpeg"


def test_parses_black_freeze_and_clipping():
    # 5 s testsrc: black box 1.0–1.8 s, the frame at 2 s held to 3.5 s, a 440 Hz sine pushed 12x past full scale
    m = parse_detect((FIX / "black_freeze_clipping.txt").read_text(), 5.0)
    assert m["black"] == [{"startMs": 1000, "endMs": 1833}]
    # a black stretch is also a still one; qc.ts reports the longer reading and ignores what's under its thresholds
    assert m["frozen"] == [{"startMs": 1000, "endMs": 1833}, {"startMs": 2000, "endMs": 3500}]
    assert m["audio"]["peakDb"] == pytest.approx(0.0, abs=0.01)
    assert m["audio"]["clippedRatio"] == pytest.approx(289 / 240000, rel=1e-3)
    assert needs_source(m)


def test_silence_reads_as_minus_120_not_inf():
    m = parse_detect((FIX / "silent.txt").read_text(), 3.0)
    assert m["audio"] == {"peakDb": SILENCE_DB, "rmsDb": SILENCE_DB, "clippedRatio": 0.0}
    assert m["black"] == [] and m["frozen"] == []
    json.dumps(m)  # no -inf/NaN reaches the wire


def test_a_freeze_still_open_at_the_end_runs_to_the_end_and_no_audio_means_no_audio_key():
    # 3 s of flat grey, no audio stream
    m = parse_detect((FIX / "still_open_freeze.txt").read_text(), 3.0)
    assert m["frozen"] == [{"startMs": 0, "endMs": 3000}]
    assert "audio" not in m


def test_clean_output_needs_no_source_pass():
    m = {"black": [], "frozen": [], "audio": {"peakDb": -1.6, "rmsDb": -19.0, "clippedRatio": 0.0}}
    assert not needs_source(m)


def test_measure_validates_against_the_render_output_contract():
    m = parse_detect((FIX / "black_freeze_clipping.txt").read_text(), 5.0)
    out = {
        "mediaId": "m1", "durationMs": 5000, "qc": {"freezes": 1, "silentAudio": False, "lufs": -14.0},
        "measure": {"durationMs": 5000, **m, "sources": {"c1": parse_detect((FIX / "silent.txt").read_text(), 3.0)}},
    }
    contract.validate_output("render", out)
    # an older worker's output, without `measure`, is still valid
    contract.validate_output("render", {k: v for k, v in out.items() if k != "measure"})


@pytest.mark.skipif(not shutil.which("ffmpeg"), reason="needs ffmpeg")
def test_measure_file_on_a_real_file(tmp_path):
    p = tmp_path / "bad.mp4"
    subprocess.run([
        "ffmpeg", "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc=size=160x90:rate=30:duration=3", "-f", "lavfi", "-i", "sine=frequency=440:duration=3",
        "-vf", "drawbox=enable='between(t,1,2)':c=black:t=fill", "-c:v", "libx264", "-pix_fmt", "yuv420p", "-c:a", "aac", str(p),
    ], check=True)
    m = measure_file(str(p))
    assert 2900 <= m["durationMs"] <= 3100
    assert len(m["black"]) == 1 and abs(m["black"][0]["startMs"] - 1000) <= 40
    assert m["audio"]["peakDb"] < -0.3 and m["audio"]["clippedRatio"] == 0


# ── qc_failed: a result that fails its quality check is final and releases the job's credits (ADR 0014) ──

def test_client_fail_sends_qc_failed_only_when_asked():
    from eyelore_engine.client import ConvexWorkerClient

    sent = []

    def handler(req: httpx.Request) -> httpx.Response:
        sent.append(json.loads(req.content))
        return httpx.Response(200, json={"ok": True})

    c = ConvexWorkerClient("http://fake", "elw_test", transport=httpx.MockTransport(handler))
    c.fail("j1", "boom")
    c.fail("j2", "the still came out blank", retryable=False, qc_failed=True)
    assert sent[0] == {"jobId": "j1", "error": "boom", "retryable": True}
    assert sent[1] == {"jobId": "j2", "error": "the still came out blank", "retryable": False, "outcome": "qc_failed"}


def test_a_handler_raising_qc_failed_is_reported_as_qc_failed(monkeypatch):
    from eyelore_engine.client import ConvexWorkerClient
    from eyelore_engine.handlers import QcFailed
    from eyelore_engine.providers import CpuStubProvider
    from eyelore_engine.worker import run_one

    fails = []

    def handler(req: httpx.Request) -> httpx.Response:
        body = json.loads(req.content or b"{}")
        if req.url.path == "/worker/claim":
            if fails:
                return httpx.Response(204)
            return httpx.Response(200, json={"job": {"id": "j1", "type": "hello", "version": 1, "idempotencyKey": "j1", "input": {"message": "hi", "steps": 1}, "attempt": 1, "leaseExpiresAt": 0}})
        if req.url.path == "/worker/fail":
            fails.append(body)
        return httpx.Response(200, json={"ok": True})

    def bad(inp, ctx):
        raise QcFailed("the result failed the quality check")

    c = ConvexWorkerClient("http://fake", "elw_test", transport=httpx.MockTransport(handler))
    assert run_one(c, CpuStubProvider(), "w", handlers={"hello": bad}) is True
    assert fails == [{"jobId": "j1", "error": "the result failed the quality check", "retryable": False, "outcome": "qc_failed"}]
