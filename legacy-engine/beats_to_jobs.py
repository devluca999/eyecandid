"""Turn an ad's beat sheet into render jobs: one image-to-video job per beat (2 seeds), starting from the
character's approved still, so the face holds. Run on the VM:
  python3 /content/drive/MyDrive/everstock-media/_engine/beats_to_jobs.py <ad-id>
Reads ads/<ad-id>/beats.json; writes jobs/<ad-id>-bNN-sK.json; outputs land in outputs/ads/<ad-id>/.
"""
import json, os, sys

MEDIA = "/content/drive/MyDrive/everstock-media"
ad_id = sys.argv[1]
sheet = json.load(open(os.path.join(MEDIA, "ads", ad_id, "beats.json")))
rep = sheet["character"]["id"]
who = sheet["character"]["look"]
new = 0
for b in sheet["beats"]:
    still = f"outputs/stills/{rep}/1105-10-scene-{rep}-{b['still']}_00001.png"
    if not os.path.exists(os.path.join(MEDIA, still)):
        print("missing still:", still)
        continue
    direction = sheet.get("direction", "")  # acting note for every beat
    prompt = (f"{who} looks straight into the lens, {b['action']}, and says: \"{b['line']}\" {direction} {sheet['look']}")
    for k, seed in enumerate((7100 + b["n"], 7200 + b["n"]), 1):
        jid = f"{ad_id}-b{b['n']:02d}-s{k}"
        path = os.path.join(MEDIA, "jobs", f"{jid}.json")
        if os.path.exists(path):
            continue
        json.dump({"id": jid, "title": f"{sheet['title']} · beat {b['n']}", "template": "i2v", "image": still,
                   "prompt": prompt, "width": 704, "height": 1280, "duration": b["seconds"] + 1, "fps": 24,
                   "seed": seed, "folder": f"ads/{ad_id}", "tags": ["beat", ad_id, rep]},
                  open(path, "w"), indent=1)
        new += 1
print(f"wrote {new} beat jobs for {ad_id}")
