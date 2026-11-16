"""Autocut on word timings: strike fillers and long silences (struck, never deleted), split beads at sentences.

Pure CPU. Polishes how it was said, never what was said: only fillers, dead air and immediate repeats are struck.
"""
from __future__ import annotations

import re

_SENTENCE_END = re.compile(r"[.!?]$")
# spelling variants ASR produces for the same hesitation: um/umm/ummm, uh/uhh, er/erm, hm/hmm, ah
_FILLER_SOUND = re.compile(r"^(u+m+|u+h+|e+r+m*|h+m+|a+h+)$")
SPLIT_PAUSE_MS = 650  # a pause this long starts a new bead even without punctuation
SOFT_MAX_WORDS = 14  # past this, split at the next comma
HARD_MAX_WORDS = 24


def _norm(t: str) -> str:
    return re.sub(r"[^\w' ]", "", t.lower()).strip()


def run(inp: dict, ctx) -> dict:
    words = inp["words"]
    min_sil = int(inp.get("minSilenceMs", 450))
    fillers = {f.lower() for f in inp.get("fillers", [])}
    multi = [f.split() for f in fillers if " " in f]
    strikes: list[dict] = []
    ctx.progress(0.2, "finding fillers")

    i = 0
    while i < len(words):
        w = words[i]
        matched = False
        for phrase in multi:
            seg = [_norm(x["text"]) for x in words[i : i + len(phrase)]]
            if seg == phrase:
                end = words[i + len(phrase) - 1]
                strikes.append({"startMs": w["startMs"], "endMs": end["endMs"], "kind": "filler", "reason": f"trimmed filler · '{' '.join(phrase)}'"})
                i += len(phrase)
                matched = True
                break
        if matched:
            continue
        n = _norm(w["text"])
        if _FILLER_SOUND.match(n):
            strikes.append({"startMs": w["startMs"], "endMs": w["endMs"], "kind": "filler", "reason": f"trimmed filler · '{n}'"})
        elif n in fillers and n not in {"so", "like"}:  # 'so'/'like' are fillers only when isolated by pauses
            strikes.append({"startMs": w["startMs"], "endMs": w["endMs"], "kind": "filler", "reason": f"trimmed filler · '{n}'"})
        elif n in {"so", "like"}:
            gap_before = w["startMs"] - words[i - 1]["endMs"] if i else 10_000
            gap_after = words[i + 1]["startMs"] - w["endMs"] if i + 1 < len(words) else 10_000
            if gap_before > 250 and gap_after > 250:
                strikes.append({"startMs": w["startMs"], "endMs": w["endMs"], "kind": "filler", "reason": f"trimmed filler · '{n}'"})
        elif i and n and n == _norm(words[i - 1]["text"]):
            strikes.append({"startMs": w["startMs"], "endMs": w["endMs"], "kind": "repeat", "reason": f"trimmed repeat · '{n}'"})
        i += 1

    ctx.progress(0.5, "finding pauses")
    for a, b in zip(words, words[1:]):
        gap = b["startMs"] - a["endMs"]
        if gap >= min_sil:
            keep = 120  # leave a breath on each side
            strikes.append({"startMs": a["endMs"] + keep, "endMs": b["startMs"] - keep, "kind": "silence", "reason": f"trimmed pause · {gap / 1000:.1f}s"})

    ctx.progress(0.8, "splitting beads")
    beads: list[dict] = []
    start = words[0]["startMs"] if words else 0
    count = 0
    for idx, w in enumerate(words):
        last = idx == len(words) - 1
        count += 1
        pause_after = (words[idx + 1]["startMs"] - w["endMs"]) if not last else 0
        if _SENTENCE_END.search(w["text"].strip()) or last or pause_after >= SPLIT_PAUSE_MS or (count >= SOFT_MAX_WORDS and w["text"].rstrip().endswith(",")) or count >= HARD_MAX_WORDS:
            count = 0
            beads.append({"inMs": start, "outMs": w["endMs"]})
            if not last:
                start = words[idx + 1]["startMs"]
    if beads:
        beads[0]["moment"] = "hook"
        if len(beads) > 1:
            beads[-1]["moment"] = "cta"

    strikes.sort(key=lambda s: s["startMs"])
    return {"strikes": strikes, "beads": beads}
