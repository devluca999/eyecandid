"""Cut a finished ad from its beat sheet with the Remotion kit and the real V2 design system.
Run on the VM:  python3 /content/drive/MyDrive/everstock-media/_engine/make_cut.py <ad-id> [take overrides like b03=s2]
Reads ads/<ad-id>/beats.json and the rendered beat clips in outputs/ads/<ad-id>/; writes outputs/finals/<ad-id>.mp4
"""
import glob, json, os, shutil, subprocess, sys

MEDIA = "/content/drive/MyDrive/everstock-media"
ENGINE = os.path.join(MEDIA, "_engine")
KIT_SRC = os.path.join(ENGINE, "remotion-kit")  # package.json, tsconfig.json, src/*
KIT = "/content/remotion-kit"
FPS = 30


def sh(*a, cwd=None):
    r = subprocess.run(list(a), capture_output=True, text=True, cwd=cwd)
    if r.returncode:
        raise RuntimeError(" ".join(a[:5]) + "\n" + (r.stdout + r.stderr)[-3000:])
    return r.stdout


def ensure_node():
    try:
        v = sh("node", "--version").strip()
        if int(v.lstrip("v").split(".")[0]) >= 18:
            return
    except Exception:
        pass
    print("installing node 20 ...")
    sh("bash", "-c", "curl -fsSL https://deb.nodesource.com/setup_20.x | bash - && apt-get install -y nodejs")


def ensure_kit():
    os.makedirs(KIT, exist_ok=True)
    for f in ("package.json", "tsconfig.json", "src/index.ts", "src/Root.tsx", "src/Ad.tsx", "src/V2.tsx"):
        os.makedirs(os.path.dirname(os.path.join(KIT, f)), exist_ok=True)
        shutil.copy(os.path.join(KIT_SRC, f.replace("/", "_")), os.path.join(KIT, f))
    pub = os.path.join(KIT, "public")
    os.makedirs(pub, exist_ok=True)
    shutil.copytree(os.path.join(ENGINE, "v2ds"), os.path.join(pub, "v2ds"), dirs_exist_ok=True)
    if not os.path.exists(os.path.join(KIT, "node_modules", "remotion")):
        print("npm install ...")
        sh("npm", "install", "--no-audit", "--no-fund", cwd=KIT)
        # Chrome's runtime libraries for headless rendering
        subprocess.run("apt-get install -y -qq libnss3 libatk1.0-0 libatk-bridge2.0-0 libcups2 libxkbcommon0 "
                       "libxcomposite1 libxdamage1 libxrandr2 libgbm1 libpango-1.0-0 libcairo2 libasound2 >/dev/null",
                       shell=True)


_model = None
def words(path):
    global _model
    if _model is None:
        from faster_whisper import WhisperModel
        _model = WhisperModel("small.en", device="cpu", compute_type="int8")
    import numpy as np
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
                         capture_output=True).stdout
    segs, _ = _model.transcribe(np.frombuffer(raw, np.float32), word_timestamps=True, vad_filter=True)
    out = []
    for w in (w for s in segs for w in s.words):
        t = w.word.strip()
        if out and t[:1] in ".,'?!":  # whisper splits "P.O." into "P" + ".O."
            out[-1]["w"] += t
            out[-1]["t1"] = round(w.end, 3)
        else:
            out.append({"t0": round(w.start, 3), "t1": round(w.end, 3), "w": t})
    return out


def dur(path):
    return float(sh("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path))


def find_take(ad_id, n, take):
    pat = os.path.join(MEDIA, "outputs", "ads", ad_id, f"{ad_id}-b{n:02d}-{take}_*.mp4")
    hits = [h for h in sorted(glob.glob(pat)) if "sheet" not in h]
    return hits[0] if hits else None


def main():
    ad_id = sys.argv[1]
    q = os.path.join(MEDIA, "ads", ad_id, "takes.json")  # picks from qc_beats.py
    picks = json.load(open(q)) if os.path.exists(q) else {}
    picks.update(a.split("=") for a in sys.argv[2:])  # manual overrides, e.g. b03=s2
    sheet = json.load(open(os.path.join(MEDIA, "ads", ad_id, "beats.json")))
    ensure_node()
    ensure_kit()
    clips_dir = os.path.join(KIT, "public", "clips")
    os.makedirs(clips_dir, exist_ok=True)
    beats = []
    for b in sheet["beats"]:
        key = f"b{b['n']:02d}"
        take = picks.get(key, "s1")
        src = find_take(ad_id, b["n"], take) or find_take(ad_id, b["n"], "s2" if take == "s1" else "s1")
        if not src:
            print(f"  {key}: no clip yet, skipped")
            continue
        name = f"{key}.mp4"
        shutil.copy(src, os.path.join(clips_dir, name))
        ws = words(src)
        d = dur(src)
        start = max(0.0, ws[0]["t0"] - 0.05) if ws else 0.0
        if not beats:  # opening line: begin on the first audible sound
            import re as _re
            det = subprocess.run(["ffmpeg", "-hide_banner", "-i", src, "-af", "silencedetect=n=-35dB:d=0.1", "-f", "null", "-"],
                                 capture_output=True, text=True).stderr
            m = _re.search(r"silence_start: 0(?:\.0+)?\s[\s\S]*?silence_end: ([\d.]+)", det)
            if m:
                start = max(start, float(m.group(1)) - 0.03)
        end = min(d, ws[-1]["t1"] + 0.2) if ws else d
        layers = b.get("layers", [])
        # split at pauses > 0.4s (jump cut) unless a V2 layer is timed against this line
        cuts = [] if layers else [(ws[i]["t1"] + 0.12, ws[i + 1]["t0"] - 0.08) for i in range(len(ws) - 1)
                                  if ws[i + 1]["t0"] - ws[i]["t1"] > 0.4]
        pieces, a = [], start
        for c0, c1 in cuts:
            pieces.append((a, c0)); a = c1
        pieces.append((a, end))
        for k, (p0, p1) in enumerate(pieces):
            beats.append({"src": f"clips/{name}", "from": round(p0, 3), "to": round(p1, 3),
                          "words": [w for w in ws if w["t0"] >= p0 - 0.01 and w["t0"] < p1],
                          "titleCard": b.get("title_card") if k == 0 else None, "layers": layers if k == 0 else []})
        print(f"  {key} {os.path.basename(src)}: {start:.2f}-{end:.2f}s  \"{' '.join(w['w'] for w in ws)}\"")
    props = os.path.join(KIT, "edit.json")
    json.dump({"beats": beats, "fps": FPS}, open(props, "w"))
    raw = os.path.join(KIT, "out", f"{ad_id}.mp4")
    print("rendering ...")
    sh("npx", "remotion", "render", "src/index.ts", "Ad", raw, f"--props={props}", "--concurrency=4",
       "--timeout=120000", "--log=error", cwd=KIT)
    out = os.path.join(MEDIA, "outputs", "finals", f"{ad_id}.mp4")
    os.makedirs(os.path.dirname(out), exist_ok=True)
    sh("ffmpeg", "-v", "error", "-y", "-i", raw, "-c:v", "copy", "-af", "loudnorm=I=-14:TP=-1:LRA=11",
       "-c:a", "aac", "-b:a", "192k", out)
    # contact sheet for QC: one frame per second
    sh("ffmpeg", "-v", "error", "-y", "-i", out, "-vf", "fps=1,scale=270:-1,tile=8x4", "-frames:v", "1",
       out.replace(".mp4", "_sheet.jpg"))
    print(f"-> {out} ({dur(out):.1f}s)")


if __name__ == "__main__":
    main()
