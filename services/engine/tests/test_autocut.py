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
    assert any(k == "silence" and r.startswith("trimmed pause · 1.5s") for k, r in kinds)


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
