"""Autocut on word timings: strike fillers, stutters, false starts, retakes and long pauses (struck, never deleted),
split beads at sentences.

The Python twin of packages/core/src/autocut.ts, kept behaviour-identical (same tests, same fixture file
packages/core/test/fixtures/autocut-cases.json). Pure CPU. Polishes how it was said, never what was said; when a rule
is unsure it leaves the words alone.

1. Mark words: fillers, single-word stutters, false starts ("so today we · so today we're…") and full retakes (a
   sentence said again right after). The earlier attempt is struck, the last take is kept.
2. Emit strikes around kept words: a run of struck words swallows the pause around it in ONE strike, from a breath
   after the last kept word to just before the next one; a pause between two kept words is trimmed the same way.
   No strike ever starts or ends inside a kept word.
"""
from __future__ import annotations

import re

_SENTENCE_END = re.compile(r"[.!?]$")
# a word the speaker cut off mid-way: "w-", "we…", "we..."
_CUT_OFF = re.compile(r"(-|…|\.\.\.)$")
# spelling variants ASR produces for the same hesitation: um/umm/ummm, uh/uhh, er/erm, hm/hmm, ah
_FILLER_SOUND = re.compile(r"^(u+m+|u+h+|e+r+m*|h+m+|a+h+)$")
# words people double on purpose ("bye bye", "very very", "no no"): never a stutter
_REDUPLICATED = {"bye", "no", "yes", "yeah", "very", "really", "ha", "oh", "now", "go", "more", "please", "wait", "okay", "ok", "well", "too", "hey"}
SPLIT_PAUSE_MS = 650  # a pause this long starts a new bead even without punctuation
SOFT_MAX_WORDS = 14  # past this, split at the next comma
HARD_MAX_WORDS = 24

BREATH_TAIL_MS = 140  # kept after the last kept word: consonant decay and the breath out
BREATH_LEAD_MS = 80  # kept before the next kept word
RESTART_GAP_MS = 200  # a pause this long between two attempts is evidence of a restart
FALSE_START_MAX_WORDS = 8
RETAKE_SAME_START = 3  # a full retake starts with this many of the same words,
RETAKE_MIN_WORDS = 4  # both sentences have at least this many words (short emphatic repeats are left alone),
RETAKE_JACCARD_NUM, RETAKE_JACCARD_DEN = 7, 10  # and the word overlap (Jaccard) is at least 7/10
QUOTE_WORDS = 6


def _norm(t: str) -> str:
    return re.sub(r"[^\w' ]", "", t.lower()).strip()


def breath(gap_ms: int) -> tuple[int, int]:
    """(tail, lead) to keep each side of a pause: never more than 45% of the gap each."""
    cap = (max(0, gap_ms) * 45) // 100
    return min(BREATH_TAIL_MS, cap), min(BREATH_LEAD_MS, cap)


def pause_around(prev_end, next_start, run=None):
    """The pause between kept words (optionally around a struck run (start, end)): (pause_ms, start_ms, end_ms) or None."""
    if run is None:
        if prev_end is None or next_start is None:
            return None
        gap = next_start - prev_end
        tail, lead = breath(gap)
        return gap, prev_end + tail, next_start - lead
    rs, re_ = run
    before = 0 if prev_end is None else max(0, rs - prev_end)
    after = 0 if next_start is None else max(0, next_start - re_)
    pause = before + after
    tail, lead = breath(pause)
    start = rs if prev_end is None else min(rs, prev_end + tail)
    end = re_ if next_start is None else max(re_, next_start - lead)
    return pause, start, end


def _secs(ms: int) -> str:
    """"1.5s", half-up in integer maths so both engines print the same thing."""
    tenths = (max(0, ms) + 50) // 100
    return f"{tenths // 10}.{tenths % 10}s"


def _quote(ws: list[dict]) -> str:
    toks = [t for t in (_norm(w["text"]) for w in ws) if t]
    return " ".join(toks[:QUOTE_WORDS]) + ("…" if len(toks) > QUOTE_WORDS else "")


def _sentences(words: list[dict]) -> list[tuple[int, int]]:
    """Sentence index ranges, split exactly as beads are."""
    out: list[tuple[int, int]] = []
    start = 0
    count = 0
    for idx, w in enumerate(words):
        last = idx == len(words) - 1
        count += 1
        pause_after = (words[idx + 1]["startMs"] - w["endMs"]) if not last else 0
        if _SENTENCE_END.search(w["text"].strip()) or last or pause_after >= SPLIT_PAUSE_MS or (count >= SOFT_MAX_WORDS and w["text"].rstrip().endswith(",")) or count >= HARD_MAX_WORDS:
            count = 0
            out.append((start, idx))
            start = idx + 1
    return out


def _false_start_at(words: list[dict], mark: list, i: int) -> int:
    """Length of the false start beginning at word i (0 if none)."""
    n = len(words)
    for k in range(min(FALSE_START_MAX_WORDS, (n - i) // 2), 1, -1):
        # the first attempt: unmarked words, no sentence end inside it (a finished sentence is not a false start)
        ok = True
        for m in range(k):
            x = words[i + m]
            if mark[i + m] is not None or not _norm(x["text"]):
                ok = False
                break
            if m < k - 1 and _SENTENCE_END.search(x["text"].strip()):
                ok = False
                break
        if not ok:
            continue
        last_raw = words[i + k - 1]["text"].strip()
        cut_off = bool(_CUT_OFF.search(last_raw))
        if not cut_off and _SENTENCE_END.search(last_raw):
            continue
        # struck fillers may sit between the attempts
        j = i + k
        while j < n and mark[j] is not None and mark[j]["kind"] == "filler":
            j += 1
        if j + k > n:
            continue
        for m in range(k):
            a = _norm(words[i + m]["text"])
            b = _norm(words[j + m]["text"])
            if mark[j + m] is not None:
                ok = False
            elif m == k - 1 and cut_off:
                ok = b.startswith(a)
            else:
                ok = a == b
            if not ok:
                break
        if not ok:
            continue
        # evidence of a restart; without it, a repeat is deliberate ("you can do it, you can do it")
        gap = words[j]["startMs"] - words[i + k - 1]["endMs"]
        if not (cut_off or j > i + k or gap >= RESTART_GAP_MS):
            continue
        # the last take goes on past the repeated words; a phrase said twice and left there is emphasis
        continues = j + k < n and not _SENTENCE_END.search(words[j + k - 1]["text"].strip())
        if not continues and not cut_off:
            continue
        return k
    return 0


def run(inp: dict, ctx) -> dict:
    words = inp["words"]
    n = len(words)
    min_sil = int(inp.get("minSilenceMs", 450))
    fillers = list(dict.fromkeys(f.lower() for f in inp.get("fillers", [])))  # ordered like the TS Set
    multi = [f.split(" ") for f in fillers if " " in f]
    items: list[dict] = []
    mark: list = [None] * n

    def add(it: dict) -> None:
        items.append(it)
        for k in range(it["i0"], it["i1"] + 1):
            mark[k] = it

    ctx.progress(0.2, "finding fillers")
    # 1a. fillers and single-word stutters
    i = 0
    while i < n:
        w = words[i]
        matched = False
        for phrase in multi:
            seg = [_norm(x["text"]) for x in words[i : i + len(phrase)]]
            if seg == phrase:
                add({"i0": i, "i1": i + len(phrase) - 1, "kind": "filler", "reason": f"trimmed filler · '{' '.join(phrase)}'"})
                i += len(phrase)
                matched = True
                break
        if matched:
            continue
        t = _norm(w["text"])
        prev = words[i - 1] if i else None
        if _FILLER_SOUND.match(t):
            add({"i0": i, "i1": i, "kind": "filler", "reason": f"trimmed filler · '{t}'"})
        elif t in fillers and t not in {"so", "like"}:
            add({"i0": i, "i1": i, "kind": "filler", "reason": f"trimmed filler · '{t}'"})
        elif t in {"so", "like"}:  # 'so'/'like' are fillers only when isolated by pauses
            gap_before = w["startMs"] - prev["endMs"] if prev else 10_000
            gap_after = words[i + 1]["startMs"] - w["endMs"] if i + 1 < n else 10_000
            if gap_before > 250 and gap_after > 250:
                add({"i0": i, "i1": i, "kind": "filler", "reason": f"trimmed filler · '{t}'"})
        elif (
            prev
            and t
            and t == _norm(prev["text"])
            and t not in _REDUPLICATED
            # a stutter: same word, back to back, within one sentence ("it it"), not "…take it. It tracks"
            and not _SENTENCE_END.search(prev["text"].strip())
            and not prev["text"].rstrip().endswith(",")
            and w["startMs"] - prev["endMs"] < 400
        ):
            add({"i0": i, "i1": i, "kind": "repeat", "reason": f"trimmed repeat · '{t}'"})
        i += 1

    ctx.progress(0.4, "finding restarts")
    # 1b. false starts: k >= 2 words said again straight after, with evidence of a restart. Keep the last attempt.
    i = 0
    while i < n:
        k = _false_start_at(words, mark, i)
        if k:
            add({"i0": i, "i1": i + k - 1, "kind": "repeat", "reason": f"kept your last take · '{_quote(words[i : i + k])}'"})
            i += k  # the next attempt may itself be restarted: chains keep only the last
        else:
            i += 1

    # 1c. full retakes: a sentence said again as the next sentence. Strike the earlier one whole.
    sents = _sentences(words)

    def toks(x0: int, x1: int) -> list[str]:
        return [_norm(words[k]["text"]) for k in range(x0, x1 + 1) if not (mark[k] is not None and mark[k]["kind"] == "filler") and _norm(words[k]["text"])]

    for s in range(len(sents) - 1):
        a0, a1 = sents[s]
        b0, b1 = sents[s + 1]
        ta, tb = toks(a0, a1), toks(b0, b1)
        if len(ta) < RETAKE_MIN_WORDS or len(tb) < RETAKE_MIN_WORDS:
            continue
        if ta[:RETAKE_SAME_START] != tb[:RETAKE_SAME_START]:
            continue
        inter = len(set(ta) & set(tb))
        union = len(set(ta) | set(tb))
        if inter * RETAKE_JACCARD_DEN < union * RETAKE_JACCARD_NUM:
            continue
        # a mark reaching out of the sentence (a false start across a long pause) already decided this stretch
        if any(it["i0"] <= a1 and it["i1"] >= a0 and (it["i0"] < a0 or it["i1"] > a1) for it in items):
            continue
        items[:] = [it for it in items if not (it["i0"] >= a0 and it["i1"] <= a1)]
        add({"i0": a0, "i1": a1, "kind": "repeat", "reason": f"kept your last take · '{_quote(words[a0 : a1 + 1])}'"})

    ctx.progress(0.6, "finding pauses")
    # 2. strikes. Runs of struck words between kept neighbours take the pause around them with them.
    strikes: list[dict] = []
    items.sort(key=lambda it: it["i0"])
    r = 0
    while r < len(items):
        e = r
        while e + 1 < len(items) and items[e + 1]["i0"] == items[e]["i1"] + 1:
            e += 1
        a, b = items[r]["i0"], items[e]["i1"]
        pause, p_start, p_end = pause_around(words[a - 1]["endMs"] if a > 0 else None, words[b + 1]["startMs"] if b + 1 < n else None, (words[a]["startMs"], words[b]["endMs"]))
        merge = pause >= min_sil
        for k in range(r, e + 1):
            it = items[k]
            strikes.append({
                "startMs": p_start if k == r and merge else words[it["i0"]]["startMs"],
                # inside a run, each strike reaches the next one: the dead air between two struck takes goes with them
                "endMs": words[items[k + 1]["i0"]]["startMs"] if k < e else p_end if merge else words[it["i1"]]["endMs"],
                "kind": it["kind"],
                "reason": it["reason"],
            })
        r = e + 1
    for k in range(n - 1):
        if mark[k] is not None or mark[k + 1] is not None:
            continue
        a, b = words[k], words[k + 1]
        if b["startMs"] - a["endMs"] < min_sil:
            continue
        pause, p_start, p_end = pause_around(a["endMs"], b["startMs"])
        if p_end > p_start:
            strikes.append({"startMs": p_start, "endMs": p_end, "kind": "silence", "reason": f"trimmed pause · {_secs(pause)}"})

    ctx.progress(0.8, "splitting beads")
    beads: list[dict] = [{"inMs": words[s0]["startMs"], "outMs": words[s1]["endMs"]} for s0, s1 in sents]
    if beads:
        beads[0]["moment"] = "hook"
        if len(beads) > 1:
            beads[-1]["moment"] = "cta"

    strikes.sort(key=lambda s: s["startMs"])
    return {"strikes": strikes, "beads": beads}
