"""Smart reframe: track the face so any aspect (9:16, 4:5, 16:9) keeps it centred.

CPU: OpenCV's bundled Haar frontal-face detector sampled at a few fps, largest face per frame, exponentially
smoothed so the frame glides rather than jitters. No face → centred keyframes, and the reason says so.
"""
from __future__ import annotations


def run(inp: dict, ctx) -> dict:
    import cv2

    path = ctx.download(inp["mediaId"])
    cap = cv2.VideoCapture(path)
    if not cap.isOpened():
        raise RuntimeError("could not open video")
    fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT) or 0)
    step = max(1, int(round(fps / float(inp.get("sampleFps", 4)))))
    det = cv2.CascadeClassifier(cv2.data.haarcascades + "haarcascade_frontalface_default.xml")

    raw: list[tuple[int, float, float, bool]] = []
    i = 0
    while True:
        ok = cap.grab()
        if not ok:
            break
        if i % step == 0:
            ok, frame = cap.retrieve()
            if not ok:
                break
            h, w = frame.shape[:2]
            gray = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            faces = det.detectMultiScale(gray, scaleFactor=1.15, minNeighbors=6, minSize=(max(24, w // 20), max(24, h // 20)))
            ms = int(i / fps * 1000)
            if len(faces):
                x, y, fw, fh = max(faces, key=lambda f: f[2] * f[3])
                raw.append((ms, (x + fw / 2) / w, (y + fh / 2.6) / h, True))  # bias up: eyes, not chin
            else:
                raw.append((ms, raw[-1][1] if raw else 0.5, raw[-1][2] if raw else 0.5, False))
            if total:
                ctx.progress(min(0.95, i / total), "finding your face")
        i += 1
    cap.release()

    found = sum(1 for r in raw if r[3])
    if found == 0:
        return {"keyframes": [{"ms": 0, "cx": 0.5, "cy": 0.5, "scale": 1.0}], "faces": 0}

    # smooth (EMA) and thin out keyframes that barely move
    alpha = 0.35
    kfs: list[dict] = []
    cx, cy = raw[0][1], raw[0][2]
    for ms, x, y, _ in raw:
        cx += alpha * (x - cx)
        cy += alpha * (y - cy)
        if not kfs or abs(cx - kfs[-1]["cx"]) > 0.01 or abs(cy - kfs[-1]["cy"]) > 0.01:
            kfs.append({"ms": ms, "cx": round(min(1, max(0, cx)), 4), "cy": round(min(1, max(0, cy)), 4), "scale": 1.0})
    return {"keyframes": kfs, "faces": found}
