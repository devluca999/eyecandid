"""ShopLink job feeder v2: product-aware version of shoplink_jobs.py (that file is left untouched).

Same four stages: candidate faces -> scene stills -> one clip per beat -> final cut.
Difference: each creator carries its own product ("ring" or "case"), so prompts describe the right
product and only ring creators get the one-ring rules.

Ad sheets: shoplink_ads.json + shoplink_case_ads.json next to this file (a brand/ads.json copy wins).
Which ads to make: --plan <json> (default shoplink_case_run.json next to this file):
  {"ads": ["shoplink-case-01"], "takes": 1}
Already-written jobs and finished cuts are skipped, so restarting is safe.

  python3 <_engine>/shoplink_jobs_v2.py --media <shoplink-media> --run <engine_run> --plan <json> --watch
"""
import argparse, glob, json, os, subprocess, sys, time

ap = argparse.ArgumentParser()
ap.add_argument("--media", default="/content/drive/MyDrive/shoplink-media")
ap.add_argument("--run", default="/content/engine_run")
ap.add_argument("--plan", default=None)
ap.add_argument("--watch", action="store_true")
args = ap.parse_args()
MEDIA, RUN = args.media, args.run
JOBS = os.path.join(MEDIA, "jobs")
HERE = os.path.dirname(os.path.abspath(__file__))
PLAN = args.plan or os.path.join(HERE, "shoplink_case_run.json")

LOOK = ("Shot on a phone, natural indoor light, true-to-life colour, natural skin texture with pores, "
        "candid and relaxed. No text, no logos, no watermark.")
KEEP = "Keep the exact face, hairstyle, skin tone and age of the person in image 2. " + LOOK


def ring(color, pronoun):
    return (f"a slim, delicate polished {color} smart ring, only about 3 mm wide like a thin wedding band, plain and "
            f"smooth with no stones, worn on the index finger of {pronoun} left hand only")


CASE = ("a small round plush velvet travel jewelry case in dusty rose pink, about the size of a palm, "
        "with a gold zipper around the edge")
CASE_OPEN = (CASE + ", unzipped and open like a clamshell: a small round mirror inside the lid, and the base "
             "split into neat little compartments holding a few gold rings, small stud earrings and a fine "
             "gold chain necklace laid flat")

PRODUCTS = {
    "ring": {
        "scene_rule": ("Exactly one ring in the whole picture: every other finger and the other hand are bare, "
                       "and the ring is a plain band with no gemstone or diamond."),
        "clip_rule": "Exactly one ring is visible, {prop}; no other rings or jewelry on any finger.",
        "wearing": True,
    },
    "case": {
        "scene_rule": ("Exactly one jewelry case in the picture, the same case every time: round, dusty rose pink "
                       "velvet, gold zipper. The person wears no rings on their fingers."),
        "clip_rule": "The jewelry case keeps the same shape and colour the whole time: {prop}.",
        "wearing": False,
    },
}

CHARS = {
    # ---- ring creators (unchanged from shoplink_jobs.py) ----
    "sl-a": {"product": "ring", "age": "mid 20s", "outfit": "a cream oversized knit sweater", "prop": ring("gold", "her"),
             "people": ["a woman with long wavy dark brown hair", "a woman with a curly black afro puff",
                        "a woman with a sleek straight blonde ponytail", "a woman with a short brown bob"],
             "scenes": {
                 "couch": "sitting cross-legged on a sofa in a cozy apartment, warm string lights and a small "
                          "decorated holiday tree softly out of focus behind, filming a selfie video",
                 "show": "holding her left hand up close to the camera to show the slim ring on her index finger, "
                         "her face just behind it and in focus, sitting on the sofa in the cozy apartment",
                 "kitchen": "leaning on a kitchen counter in the morning holding a mug, bright window light, "
                            "filming a selfie video"}},
    "sl-b": {"product": "ring", "age": "late 20s", "outfit": "a fitted grey t-shirt", "prop": ring("black", "his"),
             "people": ["a man with a short fade and a trimmed beard", "a man with messy blond hair",
                        "a man with a shaved head and light stubble", "a man with short curly black hair"],
             "scenes": {
                 "gym": "standing in a home garage gym with a squat rack and weight plates softly out of focus "
                        "behind, just after a workout, filming a selfie video",
                 "show": "holding his left hand up close to the camera to show the slim ring on his index finger, "
                         "his face just behind it and in focus, in the garage gym",
                 "car": "sitting in the driver's seat of a parked car, filming a selfie video, daylight through "
                        "the windshield"}},
    "sl-c": {"product": "ring", "age": "early 30s", "outfit": "a soft sage green loungewear set", "prop": ring("silver", "her"),
             "people": ["a woman with shoulder-length straight black hair", "a woman with red curly hair",
                        "a woman with box braids tied up", "a woman with a light brown wavy lob"],
             "scenes": {
                 "bed": "sitting up in bed in the morning, white sheets, soft window light, filming a selfie video, both hands resting low below the bottom edge of the frame, no hands or fingers visible",
                 "show": "holding her left hand up close to the camera to show the slim ring on her index finger, "
                         "her face just behind it and in focus, in a bright bedroom",
                 "desk": "at a home office desk with a laptop and a plant, daytime, filming a selfie video, both hands resting low below the bottom edge of the frame, no hands or fingers visible"}},

    # ---- travel jewelry case creators ----
    "jc-a": {"product": "case", "age": "mid 20s", "outfit": "a white ribbed tank top under an open linen shirt",
             "prop": CASE,
             "people": ["a woman with long sun-streaked brown hair in a claw clip", "a woman with a dark curly shag",
                        "a woman with a sleek black low bun", "a woman with wavy auburn shoulder-length hair"],
             "scenes": {
                 "pack": "sitting on a bed next to an open carry-on suitcase with folded clothes in it, bright "
                         "bedroom, filming a selfie video, both hands resting low below the bottom edge of the "
                         "frame, no hands visible",
                 "show": "holding " + CASE_OPEN + " up close to the camera in both hands, her face just behind it "
                         "and in focus, sitting on the bed beside the open suitcase",
                 "hotel": "sitting in an armchair by a big hotel room window with a sunny city view softly out of "
                          "focus, filming a selfie video, both hands resting low below the bottom edge of the "
                          "frame, no hands visible"}},
    "jc-b": {"product": "case", "age": "late 20s", "outfit": "a soft camel crewneck sweater",
             "prop": CASE,
             "people": ["a woman with long straight chestnut hair", "a woman with a curly black bob",
                        "a woman with honey blonde curtain bangs", "a woman with long knotless braids"],
             "scenes": {
                 "couch": "sitting on a sofa in a warm living room with a decorated holiday tree and string "
                          "lights softly out of focus behind, filming a selfie video, both hands resting low below "
                          "the bottom edge of the frame, no hands visible",
                 "show": "holding " + CASE_OPEN + " up close to the camera in both hands, her face just behind it "
                         "and in focus, sitting on the sofa in the warm living room",
                 "vanity": "sitting at a bedroom vanity table with a round mirror and a small plant softly out of "
                           "focus, soft daylight, filming a selfie video, both hands resting low below the bottom "
                           "edge of the frame, no hands visible"}},
    "jc-c": {"product": "case", "age": "late 20s", "outfit": "a navy quarter-zip pullover",
             "prop": CASE,
             "people": ["a man with a short fade and a neat beard", "a man with tousled light brown hair",
                        "a man with short black hair and glasses", "a man with a buzz cut and light stubble"],
             "scenes": {
                 "car": "sitting in the driver's seat of a parked car, filming a selfie video, daylight through "
                        "the windshield, both hands low below the bottom edge of the frame, no hands visible",
                 "show": "holding " + CASE_OPEN + " up close to the camera in both hands, his face just behind it "
                         "and in focus, sitting in the parked car",
                 "kitchen": "leaning on a kitchen counter in a bright apartment, filming a selfie video, both "
                            "hands low below the bottom edge of the frame, no hands visible"}},
}


def rel(path):
    return os.path.relpath(path, MEDIA)


def first(pattern):
    hits = sorted(glob.glob(os.path.join(MEDIA, pattern)))
    return hits[0] if hits else None


def write_job(job):
    path = os.path.join(JOBS, f"{job['id']}.json")
    if os.path.exists(path):
        return 0
    with open(path, "w") as f:
        json.dump(job, f, indent=1)
    return 1


def load(path, default):
    try:
        return json.load(open(path))
    except Exception:
        return default


def unpack_ads():
    """Write each ShopLink ad to ads/<id>/beats.json when new or changed."""
    ads = load(os.path.join(HERE, "shoplink_ads.json"), {})
    ads.update(load(os.path.join(HERE, "shoplink_case_ads.json"), {}))
    ads.update(load(os.path.join(MEDIA, "brand", "ads.json"), {}))  # a brand-folder copy wins
    for ad, sheet in ads.items():
        path = os.path.join(MEDIA, "ads", ad, "beats.json")
        if load(path, None) != sheet:
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w") as f:
                json.dump(sheet, f, indent=1, ensure_ascii=False)


def tick():
    unpack_ads()
    run = load(PLAN, {"ads": [], "takes": 1})
    picks = load(os.path.join(MEDIA, "brand", "picks.json"), {})
    takes = max(1, min(2, int(run.get("takes", 1))))
    sheets = {ad: load(os.path.join(MEDIA, "ads", ad, "beats.json"), None) for ad in run.get("ads", [])}
    sheets = {ad: s for ad, s in sheets.items() if s}
    need = {s["character"]["id"] for s in sheets.values()}
    new, waiting = 0, []

    for cid in sorted(need):
        c = CHARS[cid]
        P = PRODUCTS[c["product"]]
        base = {"type": "still", "folder": f"stills/{cid}", "tags": ["stills", cid, "shoplink"], "requested_by": "claude"}
        # 1. candidate faces
        for i, person in enumerate(c["people"], 1):
            new += write_job(dict(base, id=f"sl-cand-{cid}-{i}", title=f"{cid} candidate {i}", aspect="4:5",
                                  seed=7000 + 100 * ord(cid[-1]) + 10 * len(cid.split("-")[0]) + i,
                                  prompt=f"Head and shoulders portrait photo of {person}, {c['age']}, wearing "
                                         f"{c['outfit']}, looking at the camera with a relaxed smile, plain warm "
                                         f"off-white backdrop. {LOOK}"))
        # 2. scene stills from the chosen face
        face = picks.get(cid) or (rel(f) if (f := first(f"outputs/stills/{cid}/sl-cand-{cid}-1_*.png")) else None)
        if not face or not os.path.exists(os.path.join(MEDIA, face)):
            waiting.append(f"{cid}: face")
            continue
        wear = f" and {c['prop']}" if P["wearing"] else ""
        for key, scene in c["scenes"].items():
            new += write_job(dict(base, id=f"sl-scene-{cid}-{key}", title=f"{cid} {key}", aspect="9:16",
                                  seed=302 if key not in ("bed", "desk") else 304, ref=face,
                                  prompt=f"Photo of the person from image 2 wearing {c['outfit']}{wear}, "
                                         f"{scene}. {P['scene_rule']} "
                                         f"Vertical phone-video framing, waist up. {KEEP}"))

    for ad, s in sheets.items():
        cid = s["character"]["id"]
        c = CHARS[cid]
        P = PRODUCTS[c["product"]]
        who = s["character"]["look"]
        clips_ready = True
        for b in s["beats"]:
            still = first(f"outputs/stills/{cid}/sl-scene-{cid}-{b['still']}_*.png")
            if not still:
                waiting.append(f"{ad} b{b['n']:02d}: still {b['still']}")
                clips_ready = False
                continue
            gesture = b["still"] == "show"
            hands = "" if gesture else (" Both hands stay down below the frame the whole time and never come up "
                                        "toward the face or the camera; only the face and shoulders are in shot.")
            if P["wearing"]:
                lead = f"{who}, wearing {c['prop']}"
            elif gesture:
                lead = f"{who}, holding {CASE_OPEN} up toward the camera in both hands"
            else:
                lead = who
            rule = P["clip_rule"].format(prop=c["prop"]) if (P["wearing"] or gesture) else ""
            prompt = (f"{lead}, looks straight into the lens, {b['action']}, and says: "
                      f"\"{b['line']}\" {rule}{hands} {s.get('direction', '')} {s['look']}")
            for k, seed in enumerate((7100 + b["n"], 7200 + b["n"])[:takes], 1):
                jid = f"{ad}-b{b['n']:02d}-s{k}"
                seed = load(os.path.join(HERE, "shoplink_retakes.json"), {}).get(jid, seed)  # QC retakes
                new += write_job({"id": jid, "title": f"{s['title']} · beat {b['n']}", "template": "i2v",
                                  "image": rel(still), "prompt": prompt, "width": 704, "height": 1280,
                                  "duration": b["seconds"] + 1, "fps": 24, "seed": seed, "folder": f"ads/{ad}",
                                  "tags": ["beat", ad, cid, "shoplink"], "requested_by": "claude"})
            if not first(f"outputs/ads/{ad}/{ad}-b{b['n']:02d}-s1_*.mp4"):
                clips_ready = False
        # 4. the cut
        final = os.path.join(MEDIA, "outputs", "finals", f"{ad}.mp4")
        if clips_ready and not os.path.exists(final):
            if CUT_TRIES.get(ad, 0) < 2:
                CUT_TRIES[ad] = CUT_TRIES.get(ad, 0) + 1
                print(f"[shoplink] cutting {ad}", flush=True)
                r = subprocess.run([sys.executable, os.path.join(HERE, "shoplink_cut.py"), ad, "--run", RUN],
                                   capture_output=True, text=True)
                print((r.stdout + r.stderr)[-1500:], flush=True)
            if not os.path.exists(final):
                waiting.append(f"{ad}: cut failed {CUT_TRIES[ad]}x, see /content/shoplink_feeder.log")
        elif not clips_ready:
            waiting.append(f"{ad}: clips")

    os.makedirs(os.path.join(MEDIA, "status"), exist_ok=True)
    with open(os.path.join(MEDIA, "status", "_shoplink_feeder.json"), "w") as f:
        json.dump({"time": time.strftime("%Y-%m-%d %H:%M:%S"), "plan": PLAN, "new_jobs": new,
                   "waiting_on": waiting}, f, indent=1)
    if new:
        print(f"[shoplink] queued {new} job(s)", flush=True)
    return waiting, len(sheets)


CUT_TRIES = {}
os.makedirs(JOBS, exist_ok=True)
if not args.watch:
    print("waiting on:", tick()[0] or "nothing")
else:
    while True:
        try:
            waiting, n_ads = tick()
            if n_ads and not waiting:
                print("[shoplink] every queued ad is cut", flush=True)
                break
            if n_ads and all("cut failed 2x" in w for w in waiting):
                print("[shoplink] stopping: cuts failed, see above", flush=True)
                break
        except Exception as e:
            print("[shoplink] error:", e, flush=True)
        time.sleep(45)
