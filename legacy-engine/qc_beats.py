"""Quality gate for an ad's beat clips, then the cut.  Run on the VM (terminal):
  python3 /content/drive/MyDrive/everstock-media/_engine/qc_beats.py <ad-id> [--watch] [--cut]
For every beat it scores each take that has rendered:
  speech  - does the clip say the scripted line? (whisper words vs the line, 0-1; bar 0.85)
  ends    - the last word finishes before the clip ends (no clipped words)
  face    - is it still the same person as the approved still? (CLIP similarity of the face crop, mean and worst
            frame; bars below, calibrated on the first clips)
  shimmer - background flicker: mean frame-to-frame change of the blurred top band (bar calibrated on first clips)
The best passing take per beat goes to ads/<id>/takes.json (make_cut.py uses it). A beat with no passing take
gets two re-rolls on new seeds (once); a beat that still fails is cut with its best take and flagged.
Writes outputs/ads/<id>/qc.json and qc_sheet.jpg (frames of every take with its scores) for a human look.
--watch waits for all of the ad's jobs to finish (and any re-rolls); --cut runs make_cut.py afterwards.
"""
import difflib, glob, json, os, re, subprocess, sys, time

import numpy as np

MEDIA = "/content/drive/MyDrive/everstock-media"
BAR = {"speech": 0.85, "face_mean": 0.62, "face_min": 0.50, "shimmer": 99, "lunge": 1.45}
REROLL_SEEDS = (7300, 7400)


def sh(*a):
    return subprocess.run(list(a), capture_output=True, text=True).stdout


def dur(path):
    return float(sh("ffprobe", "-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", path) or 0)


def frames(path, n=8, size=(352, 640)):
    """n evenly spaced RGB frames."""
    d = dur(path)
    out = []
    for k in range(n):
        t = d * (k + 0.5) / n
        raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{t:.2f}", "-i", path, "-frames:v", "1",
                              "-vf", f"scale={size[0]}:{size[1]}", "-f", "rawvideo", "-pix_fmt", "rgb24", "-"],
                             capture_output=True).stdout
        if len(raw) == size[0] * size[1] * 3:
            out.append(np.frombuffer(raw, np.uint8).reshape(size[1], size[0], 3))
    return out


# ---- speech ----
_wm = None
def words(path):
    global _wm
    if _wm is None:
        from faster_whisper import WhisperModel
        _wm = WhisperModel("small.en", device="cpu", compute_type="int8")
    raw = subprocess.run(["ffmpeg", "-v", "error", "-i", path, "-f", "f32le", "-ac", "1", "-ar", "16000", "-"],
                         capture_output=True).stdout
    if not raw:
        return []
    segs, _ = _wm.transcribe(np.frombuffer(raw, np.float32), word_timestamps=True, vad_filter=True)
    return [(w.start, w.end, w.word.strip()) for s in segs for w in s.words]


NUM = {"one": "1", "two": "2", "three": "3", "four": "4", "five": "5", "first": "1st"}
def norm(text):
    ws = re.sub(r"[^a-z0-9 ]", " ", text.lower().replace("’", "").replace("'", "")).split()
    out, prev_single = [], False
    for w in (NUM.get(w, w) for w in ws):  # "p o" (from "P.O.") -> "po"
        single = len(w) == 1 and w.isalpha()
        if single and prev_single:
            out[-1] += w
        else:
            out.append(w)
        prev_single = single
    return out


def speech_score(line, ws):
    a, b = norm(line), norm(" ".join(w[2] for w in ws))
    return round(difflib.SequenceMatcher(None, a, b).ratio(), 3)


# ---- face ----
_clip = None
def clip_embed(imgs):
    global _clip
    import torch
    from PIL import Image
    if _clip is None:
        from transformers import CLIPModel, CLIPProcessor
        m = CLIPModel.from_pretrained("openai/clip-vit-base-patch32").eval()
        _clip = (m, CLIPProcessor.from_pretrained("openai/clip-vit-base-patch32"))
    m, p = _clip
    with torch.no_grad():
        e = m.get_image_features(**p(images=[Image.fromarray(i) for i in imgs], return_tensors="pt"))
    e = getattr(e, "pooler_output", e)  # transformers 5 returns an output object
    e = e / e.norm(dim=-1, keepdim=True)
    return e.numpy()


_cascade = None
_last_h = []
def face_crop(img):
    """Largest face, padded to include hair; None if no face. Records the face height for the lunge check."""
    global _cascade
    import cv2
    if _cascade is None:
        _cascade = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")
    g = cv2.cvtColor(img, cv2.COLOR_RGB2GRAY)
    f = _cascade.detectMultiScale(g, 1.1, 5, minSize=(40, 40))
    if len(f) == 0:
        return None
    x, y, w, h = max(f, key=lambda r: r[2] * r[3])
    _last_h.append(h)
    p = int(0.35 * w)
    H, W = g.shape
    return img[max(0, y - p):min(H, y + h + p // 2), max(0, x - p // 2):min(W, x + w + p // 2)]


def face_score(ref_img, imgs):
    ref = face_crop(ref_img)
    _last_h.clear()
    crops = [c for c in (face_crop(i) for i in imgs) if c is not None]
    if ref is None or not crops:
        return None, None, len(crops)
    e = clip_embed([ref] + crops)
    sims = e[1:] @ e[0]
    return round(float(sims.mean()), 3), round(float(sims.min()), 3), len(crops)


# ---- shimmer ----
def shimmer(path):
    """Mean frame-to-frame change of the blurred top band (background) over the middle 2 seconds."""
    import cv2
    d = dur(path)
    raw = subprocess.run(["ffmpeg", "-v", "error", "-ss", f"{max(0, d / 2 - 1):.2f}", "-t", "2", "-i", path,
                          "-vf", "scale=176:320,format=gray", "-f", "rawvideo", "-"], capture_output=True).stdout
    fr = np.frombuffer(raw, np.uint8)
    n = len(fr) // (176 * 320)
    if n < 3:
        return None
    fr = fr[:n * 176 * 320].reshape(n, 320, 176).astype(np.float32)
    band = np.stack([cv2.GaussianBlur(f[:70], (5, 5), 0) for f in fr])
    return round(float(np.abs(np.diff(band, axis=0)).mean()), 3)


def score(path, line, ref_img):
    d = dur(path)
    ws = words(path)
    imgs = frames(path)
    fm, fmin, nfaces = face_score(ref_img, imgs) if ref_img is not None else (None, None, 0)
    s = {"clip": os.path.relpath(path, MEDIA), "duration": round(d, 2), "heard": " ".join(w[2] for w in ws),
         "speech": speech_score(line, ws),
         "ends_ok": bool(ws) and ws[-1][1] < d - 0.1,
         "lunge": round(max(_last_h) / min(_last_h), 2) if len(_last_h) > 1 else 1.0,
         "face_mean": fm, "face_min": fmin, "faces_found": f"{nfaces}/{len(imgs)}", "shimmer": shimmer(path)}
    fails = []
    if s["speech"] < BAR["speech"]:
        fails.append("speech")
    if not s["ends_ok"]:
        fails.append("ends")
    if fm is None or fm < BAR["face_mean"] or fmin < BAR["face_min"]:
        fails.append("face")
    if s["lunge"] > BAR["lunge"]:
        fails.append("lunge")
    if s["shimmer"] is not None and s["shimmer"] > BAR["shimmer"]:
        fails.append("shimmer")
    s["fails"] = fails
    s["pass"] = not fails
    # one number to rank takes: speech first, then identity, then calm background
    s["rank"] = round(s["speech"] * 2 + (fm or 0) + (fmin or 0) - 0.2 * (s["shimmer"] or 0) - (s["lunge"] - 1) - 0.5 * len(fails), 3)
    return s, imgs


def ad_jobs(ad_id):
    return sorted(glob.glob(os.path.join(MEDIA, "jobs", f"{ad_id}-b*-s*.json")))


def job_state(jid):
    p = os.path.join(MEDIA, "status", f"{jid}.json")
    try:
        return json.load(open(p)).get("state", "queued")
    except Exception:
        return "queued"


def wait_for_jobs(ad_id):
    while True:
        pend = [os.path.basename(j)[:-5] for j in ad_jobs(ad_id)]
        pend = [j for j in pend if job_state(j) not in ("done", "failed", "error")]
        if not pend:
            return
        print(time.strftime("%H:%M"), f"waiting on {len(pend)} clips (next: {pend[0]})", flush=True)
        time.sleep(90)


def take_path(ad_id, jid):
    st = os.path.join(MEDIA, "status", f"{jid}.json")
    try:
        outs = [o for o in json.load(open(st)).get("outputs", []) if o.endswith(".mp4")]
        if outs:
            return os.path.join(MEDIA, outs[0])
    except Exception:
        pass
    hits = [h for h in glob.glob(os.path.join(MEDIA, "outputs", "ads", ad_id, f"{jid}_*.mp4")) if "sheet" not in h]
    return sorted(hits)[0] if hits else None


def run_qc(ad_id):
    from PIL import Image, ImageDraw
    sheet = json.load(open(os.path.join(MEDIA, "ads", ad_id, "beats.json")))
    rep = sheet["character"]["id"]
    out_dir = os.path.join(MEDIA, "outputs", "ads", ad_id)
    report, picks, rerolls, rows = {}, {}, [], []
    for b in sheet["beats"]:
        key = f"b{b['n']:02d}"
        still = os.path.join(MEDIA, f"outputs/stills/{rep}/1105-10-scene-{rep}-{b['still']}_00001.png")
        ref = np.array(Image.open(still).convert("RGB").resize((352, 640))) if os.path.exists(still) else None
        takes = {}
        for j in ad_jobs(ad_id):
            jid = os.path.basename(j)[:-5]
            if not jid.startswith(f"{ad_id}-{key}-"):
                continue
            p = take_path(ad_id, jid)
            if not p:
                continue
            s, imgs = score(p, b["line"], ref)
            takes[jid.rsplit("-", 1)[1]] = s
            rows.append((f"{key} {jid.rsplit('-', 1)[1]}", s, imgs[::2]))
            print(f"  {key} {jid.rsplit('-', 1)[1]}: speech {s['speech']} face {s['face_mean']}/{s['face_min']} "
                  f"shimmer {s['shimmer']} {'PASS' if s['pass'] else 'fail: ' + ','.join(s['fails'])}  \"{s['heard']}\"",
                  flush=True)
        if not takes:
            print(f"  {key}: no takes rendered")
            continue
        best = max(takes, key=lambda k: (takes[k]["pass"], takes[k]["rank"]))
        picks[key] = best
        report[key] = {"line": b["line"], "pick": best, "pass": takes[best]["pass"], "takes": takes}
        if not any(t["pass"] for t in takes.values()):
            rerolls.append(b)
    json.dump(report, open(os.path.join(out_dir, "qc.json"), "w"), indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o))
    json.dump(picks, open(os.path.join(MEDIA, "ads", ad_id, "takes.json"), "w"), indent=1)
    # contact sheet: one row per take, 4 frames + scores
    if rows:
        W, H = 132, 240
        im = Image.new("RGB", (W * 4 + 360, H * len(rows)), (250, 249, 246))
        d = ImageDraw.Draw(im)
        for r, (label, s, imgs) in enumerate(rows):
            for c, f in enumerate(imgs[:4]):
                im.paste(Image.fromarray(f).resize((W, H)), (c * W, r * H))
            col = (20, 120, 60) if s["pass"] else (180, 40, 30)
            txt = (f"{label}  {'PASS' if s['pass'] else 'FAIL ' + ','.join(s['fails'])}\n"
                   f"speech {s['speech']}\nface {s['face_mean']} / min {s['face_min']} ({s['faces_found']})\n"
                   f"shimmer {s['shimmer']}  lunge {s['lunge']}\nheard: {s['heard'][:120]}")
            d.multiline_text((W * 4 + 12, r * H + 10), txt, fill=col, spacing=6)
        im.save(os.path.join(out_dir, "qc_sheet.jpg"), quality=85)
    return report, rerolls


def queue_rerolls(ad_id, beats):
    """Two more seeds for beats where no take passed. Same prompt as the first takes."""
    n = 0
    for b in beats:
        base = os.path.join(MEDIA, "jobs", f"{ad_id}-b{b['n']:02d}-s1.json")
        if not os.path.exists(base):
            continue
        job = json.load(open(base))
        for k, seed in ((3, REROLL_SEEDS[0] + b["n"]), (4, REROLL_SEEDS[1] + b["n"])):
            jid = f"{ad_id}-b{b['n']:02d}-s{k}"
            p = os.path.join(MEDIA, "jobs", f"{jid}.json")
            if os.path.exists(p):
                continue
            job.update(id=jid, seed=seed)
            json.dump(job, open(p, "w"), indent=1)
            n += 1
    print(f"queued {n} re-rolls")
    return n


if __name__ == "__main__":
    ad_id = sys.argv[1]
    watch, cut = "--watch" in sys.argv, "--cut" in sys.argv
    if watch:
        wait_for_jobs(ad_id)
    report, rerolls = run_qc(ad_id)
    if rerolls and watch and queue_rerolls(ad_id, rerolls):
        wait_for_jobs(ad_id)
        report, rerolls = run_qc(ad_id)
    bad = [k for k, v in report.items() if not v["pass"]]
    print(f"QC: {len(report) - len(bad)}/{len(report)} beats pass" + (f"; below the bar: {', '.join(bad)}" if bad else ""))
    if cut:
        subprocess.run(["python3", os.path.join(MEDIA, "_engine", "make_cut.py"), ad_id])
