import json
from pathlib import Path

from eyelore_engine import contract
from eyelore_engine.handlers import autocut


class Ctx:
    worker_name, provider = "t", "cpu-stub"

    def progress(self, p, stage):
        pass


def w(text, s, e):
    return {"text": text, "startMs": s, "endMs": e, "conf": 1.0}


WORDS = [
    w("um", 0, 300), w("this", 400, 600), w("ring", 650, 900), w("ring", 950, 1200), w("tracks", 1250, 1500),
    w("sleep.", 1550, 1900), w("you", 3400, 3500), w("know", 3520, 3700), w("link", 3800, 4000), w("below.", 4050, 4400),
]


def test_strikes_fillers_repeats_and_pauses_without_changing_words():
    out = autocut.run({"words": WORDS, "minSilenceMs": 450, "fillers": ["um", "you know"]}, Ctx())
    contract.validate_output("autocut", out)
    kinds = [(s["kind"], s["reason"]) for s in out["strikes"]]
    assert ("filler", "trimmed filler · 'um'") in kinds
    assert ("filler", "trimmed filler · 'you know'") in kinds
    assert ("repeat", "trimmed repeat · 'ring'") in kinds
    # the 1.5s pause before "you know" goes with it in one strike: no second, back-to-back pause strike
    assert not any(k == "silence" for k, _ in kinds)
    yk = next(s for s in out["strikes"] if s["reason"] == "trimmed filler · 'you know'")
    assert (yk["startMs"], yk["endMs"]) == (1900 + 140, 3800 - 80)


def test_beads_split_at_sentences_with_hook_and_cta():
    out = autocut.run({"words": WORDS, "minSilenceMs": 450, "fillers": []}, Ctx())
    assert [(b["inMs"], b["outMs"]) for b in out["beads"]] == [(0, 1900), (3400, 4400)]
    assert out["beads"][0]["moment"] == "hook" and out["beads"][-1]["moment"] == "cta"


def test_filler_spelling_variants_and_pause_splits_without_punctuation():
    words = [w("UMM,", 0, 300), w("this", 400, 600), w("ring", 650, 900), w("tracks", 950, 1200), w("sleep", 1250, 1600),
             w("it", 2600, 2700), w("lasts", 2750, 3000), w("a", 3050, 3100), w("week", 3150, 3500)]
    out = autocut.run({"words": words, "minSilenceMs": 450, "fillers": []}, Ctx())
    assert ("filler", "trimmed filler · 'umm'") in [(s["kind"], s["reason"]) for s in out["strikes"]]
    assert [(b["inMs"], b["outMs"]) for b in out["beads"]] == [(0, 1600), (2600, 3500)]


def test_repeat_never_crosses_a_sentence():
    words = [w("take", 0, 200), w("it.", 250, 400), w("It", 900, 1000), w("tracks", 1050, 1300)]
    out = autocut.run({"words": words, "minSilenceMs": 2000, "fillers": []}, Ctx())
    assert not [s for s in out["strikes"] if s["kind"] == "repeat"]


# --- taste: last clean take, breath padding (same cases as packages/core/test/autocut.test.ts) ---
_CASES = json.loads((Path(__file__).resolve().parents[3] / "packages/core/test/fixtures/autocut-cases.json").read_text())["cases"]


def _strikes(words, fillers=(), min_sil=450):
    out = autocut.run({"words": words, "minSilenceMs": min_sil, "fillers": list(fillers)}, Ctx())
    contract.validate_output("autocut", out)
    return [(s["startMs"], s["endMs"], s["kind"], s["reason"]) for s in out["strikes"]]


def _case(name):
    return next(c for c in _CASES if c["name"] == name)["input"]


def test_matches_the_typescript_engine_on_every_shared_case():
    assert len(_CASES) > 60
    for c in _CASES:
        assert autocut.run(c["input"], Ctx()) == c["output"], c["name"]


def test_keeps_the_last_take_of_a_false_start():
    assert _strikes(_case("false start after a pause")["words"]) == [(0, 850, "repeat", "kept your last take · 'so today we'")]
    assert _strikes(_case("false start ending in a cut-off word")["words"]) == [(0, 550, "repeat", "kept your last take · 'so we'")]
    assert _strikes(_case("false start with a filler between")["words"]) == [
        (0, 600, "repeat", "kept your last take · 'i think'"), (600, 850, "filler", "trimmed filler · 'um'")]
    assert [s[3] for s in _strikes(_case("false start chain keeps the last")["words"])] == ["kept your last take · 'so today'"] * 2


def test_never_cuts_deliberate_repetition():
    for name in ["rhetorical repeat without a pause", "rhetorical repeat that ends the sentence", "never never give up", "i came i saw", "bye bye",
                 "so so good", "a finished sentence is not a false start", "anaphora is not a retake", "short emphatic repeat is not a retake",
                 "a changed word is not a repeat"]:
        i = _case(name)
        assert _strikes(i["words"], i["fillers"], i["minSilenceMs"]) == [], name


def test_full_retake_strikes_the_earlier_sentence_whole():
    assert _strikes(_case("full retake")["words"]) == [(0, 3070, "repeat", "kept your last take · 'so today we're going to talk…'")]
    assert [(s, e) for s, e, _, _ in _strikes(_case("three takes keep the last")["words"])] == [(0, 2150), (2150, 4720)]


def test_breath_padding_and_merged_filler_strikes():
    assert _strikes(_case("pause between kept words")["words"]) == [(390, 1170, "silence", "trimmed pause · 1.0s")]
    assert _strikes(_case("short pause keeps 45% each side at most")["words"], min_sil=200) == [(340, 370, "silence", "trimmed pause · 0.2s")]
    assert _strikes(_case("filler swallows the pauses around it")["words"], ["um"]) == [(390, 1220, "filler", "trimmed filler · 'um'")]
    assert _strikes(_case("filler in tight speech is cut on its word")["words"], ["um"]) == [(300, 550, "filler", "trimmed filler · 'um'")]
    assert _strikes(_case("two fillers in a row")["words"], ["um", "uh"]) == [
        (390, 1100, "filler", "trimmed filler · 'um'"), (1100, 1770, "filler", "trimmed filler · 'uh'")]


def test_no_strike_reaches_into_a_kept_word():
    for c in _CASES:
        words = c["input"]["words"]
        strikes = autocut.run(c["input"], Ctx())["strikes"]
        struck = {k for k, w in enumerate(words) for s in strikes if s["kind"] != "silence" and s["startMs"] <= w["startMs"] and w["endMs"] <= s["endMs"]}
        for k, w in enumerate(words):
            if k in struck:
                continue
            for s in strikes:
                assert not (s["startMs"] < w["endMs"] and w["startMs"] < s["endMs"]), (c["name"], w, s)
