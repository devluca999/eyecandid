"""Everstock voice renderer: Chatterbox TTS, run by worker.py inside its own environment (/content/tts_env).

Chatterbox pins torch 2.6 / numpy<2 / transformers 5.2, which would break ComfyUI, so it never shares
ComfyUI's Python. Usage: <tts_env python> tts_runner.py <spec.json>

spec: {"text", "model": "turbo"|"original", "voice": path or null, "takes": 3, "seed": int,
       "exaggeration": 0.5, "cfg_weight": 0.5, "out_prefix": "/content/tts_out/<id>", "result": "<path>.json"}
"""
import json, re, sys

import torch
import torchaudio as ta

spec = json.load(open(sys.argv[1]))
model_name = spec.get("model") or "turbo"
if model_name == "turbo":
    from chatterbox.tts_turbo import ChatterboxTurboTTS as Model
else:
    from chatterbox.tts import ChatterboxTTS as Model

model = Model.from_pretrained(device="cuda" if torch.cuda.is_available() else "cpu")

kw = {}
if model_name != "turbo":  # Turbo ignores these and warns
    kw = {"exaggeration": float(spec.get("exaggeration", 0.5)), "cfg_weight": float(spec.get("cfg_weight", 0.5))}

if spec.get("voice"):  # clone this reference clip (Turbo needs more than 5 s; about 10 s is best)
    if kw:
        model.prepare_conditionals(spec["voice"], exaggeration=kw["exaggeration"])
    else:
        model.prepare_conditionals(spec["voice"])
# with no voice, the model's built-in default voice is used


def chunks(text, limit=280):
    """Chatterbox is best on a sentence or two at a time: split long scripts at sentence ends."""
    out, cur = [], ""
    for s in re.split(r"(?<=[.!?])\s+", text.strip()):
        if cur and len(cur) + len(s) + 1 > limit:
            out.append(cur)
            cur = s
        else:
            cur = (cur + " " + s).strip()
    if cur:
        out.append(cur)
    return out


files = []
gap = torch.zeros(1, int(model.sr * 0.25))
for t in range(int(spec.get("takes", 3))):
    torch.manual_seed(int(spec["seed"]) + t)
    pieces = []
    for c in chunks(spec["text"]):
        pieces += [model.generate(c, **kw).cpu(), gap]
    wav = torch.cat(pieces[:-1], dim=1)
    path = f"{spec['out_prefix']}_take{t + 1}.wav"
    ta.save(path, wav, model.sr)
    files.append(path)
    print(f"take {t + 1}: {wav.shape[1] / model.sr:.1f} s -> {path}", flush=True)

json.dump({"files": files, "sr": model.sr, "model": model_name}, open(spec["result"], "w"))
