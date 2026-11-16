"""Final check of finished ads (5 Nov): format, loudness, silences, black frames, full transcript vs script,
and a large-frame sheet (one frame per beat midpoint) for a close look. Prints a report and writes
outputs/finals/<ad>_check.jpg and outputs/finals/check_report.txt
"""
import difflib, json, os, re, subprocess, sys
import numpy as np

MEDIA = "/content/drive/MyDrive/everstock-media"
FIN = os.path.join(MEDIA, "outputs", "finals")
ADS = sys.argv[1:] or ["b-ttny-first-warehouse", "a-ttny-holding-stock", "c-ttny-production-buying"]


def run(*a):
    r = subprocess.run(list(a), capture_output=True, text=True)
    return r.stdout + r.stderr


def norm(t):
    t = t.lower().replace("’", "").replace("'", "").replace("p.o.", "po").replace("p .o.", "po")
    ws = re.sub(r"[^a-z0-9 ]", " ", t).split()
    num = {"one": "1", "two": "2", "three": "3", "four": "4", "six": "6"}
    return [num.get(w, w) for w in ws]


from faster_whisper import WhisperModel
wm = WhisperModel("small.en", device="cpu", compute_type="int8")
report = []
for ad in ADS:
    f = os.path.join(FIN, f"{ad}.mp4")
    sheet = json.load(open(os.path.join(MEDIA, "ads", ad, "beats.json")))
    info = json.loads(subprocess.run(["ffprobe", "-v", "error", "-show_streams", "-show_format", "-of", "json", f],
                                     capture_output=True, text=True).stdout)
    v = next(s for s in info["streams"] if s["codec_type"] == "video")
    a = [s for s in info["streams"] if s["codec_type"] == "audio"]
    dur = float(info["format"]["duration"])
    ln = run("ffmpeg", "-hide_banner", "-i", f, "-af", "loudnorm=I=-14:TP=-1:LRA=11:print_format=json", "-f", "null", "-")
    lj = json.loads(ln[ln.rindex("{"):ln.rindex("}") + 1])
    sil = re.findall(r"silence_start: ([\d.]+)[\s\S]*?silence_duration: ([\d.]+)",
                     run("ffmpeg", "-hide_banner", "-i", f, "-af", "silencedetect=n=-40dB:d=0.45", "-f", "null", "-"))
    blk = re.findall(r"black_start:([\d.]+) black_end:([\d.]+)",
                     run("ffmpeg", "-hide_banner", "-i", f, "-vf", "blackdetect=d=0.1:pix_th=0.1", "-an", "-f", "null", "-"))
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", f, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"], capture_output=True).stdout
    segs, _ = wm.transcribe(np.frombuffer(raw, np.float32), vad_filter=False)
    heard = " ".join(s.text.strip() for s in segs)
    script = " ".join(b["line"] for b in sheet["beats"])
    sm = difflib.SequenceMatcher(None, norm(script), norm(heard))
    diffs = [(op, " ".join(norm(script)[i1:i2]), " ".join(norm(heard)[j1:j2])) for op, i1, i2, j1, j2 in sm.get_opcodes() if op != "equal"]
    report += [f"== {ad}", f"  {v['width']}x{v['height']} {v['r_frame_rate']} fps, {dur:.1f}s, audio streams: {len(a)}",
               f"  loudness {lj['input_i']} LUFS (target -14), true peak {lj['input_tp']} dBTP",
               f"  silences >0.45s: {[(round(float(s), 1), round(float(d), 2)) for s, d in sil] or 'none'}",
               f"  black frames: {blk or 'none'}",
               f"  script match {sm.ratio():.3f}; differences: {diffs or 'none'}",
               f"  heard: {heard}"]
    # big frames: one per second, 4 across, 540 wide
    subprocess.run(["ffmpeg", "-v", "error", "-y", "-i", f, "-vf", "fps=1,scale=540:-1,tile=4x7", "-frames:v", "1",
                    os.path.join(FIN, f"{ad}_check.jpg")])
open(os.path.join(FIN, "check_report.txt"), "w").write("\n".join(report) + "\n")
print("\n".join(report))
