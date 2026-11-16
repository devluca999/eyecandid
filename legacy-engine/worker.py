"""Everstock media worker: turns job files in the shared Drive folder into rendered videos.

Runs on the Colab VM, from the notebook with:  %run -i /content/drive/MyDrive/everstock-media/_engine/worker.py

Drive layout (MEDIA = everstock-media, shared with the team):
  MEDIA/assets/            reference images, logos, product shots (input for image-to-video)
  MEDIA/jobs/<id>.json     job requests (written by Claude or by hand)
  MEDIA/outputs/           rendered videos  (<id>_00001_.mp4) + manifest.csv
  MEDIA/status/<id>.json   per-job state: queued -> running -> done | failed
  MEDIA/status/_worker.json  heartbeat: is the worker alive, what is it doing
  MEDIA/_engine/            this worker, the template exporter, templates/ (API workflows + .map.json)

Job file fields (all optional except prompt):
  {"id": "...", "template": "t2v" | "i2v" | "flf2v", "prompt": "...",
   "width": 704, "height": 1248, "duration": 5, "fps": 24, "seed": 123,
   "prompt_enhance": false, "image": "assets/x.png", "last_image": "assets/y.png",
   "title": "short human label", "tags": ["linkedin"], "requested_by": "luca"}

Stops the runtime (ends billing) after IDLE_MINUTES with nothing to do, or at MAX_SESSION_HOURS.
Interrupt the cell to stop the worker without shutting the runtime down.
"""
import csv, json, os, re, shutil, socket, subprocess, sys, time, threading, traceback, urllib.error, urllib.request, uuid

# ---------- settings (can be overridden by variables set before %run -i) ----------
def _g(name, default):
    return globals().get(name, default)

MEDIA = _g("MEDIA", "/content/drive/MyDrive/everstock-media")
SYS_DIR = _g("SYS_DIR", os.path.join(MEDIA, "_engine"))
COMFY_DIR = _g("COMFY_DIR", "/content/ComfyUI")
IDLE_MINUTES = _g("IDLE_MINUTES", 20)
MAX_SESSION_HOURS = _g("MAX_SESSION_HOURS", 3)
POLL_SECONDS = _g("POLL_SECONDS", 15)
JOB_TIMEOUT_MIN = _g("JOB_TIMEOUT_MIN", 30)
SESSION_START = _g("SESSION_START", time.time())
CU_PER_HOUR = _g("CU_PER_HOUR", {"L4": 1.71, "A100": 5.40, "T4": 1.19})
USD_PER_CU = _g("USD_PER_CU", 0.10)
GPU_KEY = _g("GPU_KEY", None)

TEMPLATES = {"t2v": "video_ltx2_5_t2v", "i2v": "video_ltx2_5_i2v", "flf2v": "video_ltx2_5_flf2v",
             "edit": "image_qwen_image_edit_2511_int8", "t2i": "image_z_image_turbo_int8"}
API = "http://127.0.0.1:8188"
D = {k: os.path.join(MEDIA, k) for k in ("assets", "jobs", "outputs", "status")}
D["templates"] = os.path.join(SYS_DIR, "templates")
for p in D.values():
    os.makedirs(p, exist_ok=True)
CLIENT_ID = uuid.uuid4().hex
_comfy_proc = None

def now_iso():
    return time.strftime("%Y-%m-%dT%H:%M:%S%z")

def log(msg):
    print(f"[{time.strftime('%H:%M:%S')}] {msg}", flush=True)

def write_json(path, data):
    # Write in place (no temp file + rename): on Google Drive a rename creates a new file ID,
    # and Claude reads status files by a stable ID through the Drive API.
    with open(path, "w") as f:
        json.dump(data, f, indent=1)

def read_json(path):
    with open(path) as f:
        return json.load(f)

def http_json(path, payload=None, timeout=30):
    req = urllib.request.Request(API + path,
                                 data=None if payload is None else json.dumps(payload).encode(),
                                 headers={"Content-Type": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        body = e.read().decode("utf-8", "replace")
        raise RuntimeError(f"ComfyUI {e.code} on {path}: {body[:3000]}") from None

# ---------- ComfyUI process ----------
def comfy_up():
    try:
        socket.create_connection(("127.0.0.1", 8188), timeout=2).close()
        return True
    except OSError:
        return False

def ensure_comfy():
    global _comfy_proc
    if comfy_up():
        return
    log("starting ComfyUI ...")
    logf = open("/content/comfyui.log", "a")
    _comfy_proc = subprocess.Popen([sys.executable, "main.py", "--listen", "127.0.0.1", "--port", "8188"],
                                   cwd=COMFY_DIR, stdout=logf, stderr=subprocess.STDOUT)
    for _ in range(240):
        if comfy_up():
            log("ComfyUI is up")
            return
        if _comfy_proc.poll() is not None:
            break
        time.sleep(2)
    tail = subprocess.run(["tail", "-n", "40", "/content/comfyui.log"], capture_output=True, text=True).stdout
    raise RuntimeError("ComfyUI failed to start. Last log lines:\n" + tail)

# ---------- templates ----------
def template_paths(key):
    name = TEMPLATES[key]
    return (os.path.join(D["templates"], f"{name}.api.json"),
            os.path.join(D["templates"], f"{name}.map.json"))

def ensure_templates():
    ensure_workflow_files()
    missing = [TEMPLATES[k] for k in TEMPLATES if not os.path.exists(template_paths(k)[0])]
    if not missing:
        for k in TEMPLATES:
            if not os.path.exists(template_paths(k)[0].replace(".api.json", ".summary.json")):
                write_summary(k)
        return
    log(f"exporting API templates: {missing} (first run only, ~2 min)")
    r = subprocess.run([sys.executable, os.path.join(SYS_DIR, "export_templates.py"), D["templates"], *missing],
                       capture_output=True, text=True)
    print(r.stdout[-3000:])
    if r.returncode != 0:
        print(r.stderr[-3000:])
        raise RuntimeError("template export failed")
    for k in TEMPLATES:
        write_summary(k)

MODELS = _g("MODELS", "/content/drive/MyDrive/everstock_comfy/models")  # private Drive cache
LOADERS = {"CLIPLoader": ("clip_name", "text_encoders"), "UNETLoader": ("unet_name", "diffusion_models"),
           "VAELoader": ("vae_name", "vae"), "LatentUpscaleModelLoader": ("model_name", "latent_upscale_models"),
           "LoraLoaderModelOnly": ("lora_name", "loras")}

def model_source(name, sub):
    if name.startswith("gemma4_"):
        return "Comfy-Org/gemma-4", f"text_encoders/{name}"
    if name.startswith("ltx-2.5") or name.startswith("gemma4-12b-with-proj"):
        return "Lightricks/LTX-2.5", f"{sub}/{name}"
    return template_model_urls().get(name, (None, None))

LOCAL_MODELS = _g("LOCAL_MODELS", "/content/models_local")  # fast VM SSD; ComfyUI must read from here

def ensure_models():
    """Put every model file the templates reference on the VM's local SSD.

    Reading weights through the Google Drive mount is far too slow for ComfyUI's streaming loader
    (a render can sit at step 0 for 10+ minutes), so each session stages models locally:
    straight from Hugging Face (~300 MB/s) or, failing that, copied from the private Drive cache.
    Returns True if any ComfyUI model link changed (ComfyUI must then be restarted)."""
    needed = set()
    for k in TEMPLATES:
        api_path = template_paths(k)[0]
        if not os.path.exists(api_path):
            continue
        for n in read_json(api_path).values():
            if n.get("class_type") in LOADERS:
                field, sub = LOADERS[n["class_type"]]
                val = n.get("inputs", {}).get(field)
                if isinstance(val, str):
                    needed.add((val, sub))
    token = None
    changed = False
    for name, sub in sorted(needed):
        local = os.path.join(LOCAL_MODELS, sub, name)
        dst = os.path.join(COMFY_DIR, "models", sub, name)
        if not os.path.exists(local):
            os.makedirs(os.path.dirname(local), exist_ok=True)
            repo, path = model_source(name, sub)
            got = False
            if repo:
                if token is None:
                    try:
                        from google.colab import userdata
                        token = userdata.get("HF_TOKEN_LTX")
                    except Exception:
                        token = ""
                try:
                    log(f"fetching {name} to local disk from {repo} ...")
                    from huggingface_hub import hf_hub_download
                    tmp = hf_hub_download(repo, path, token=token or None, local_dir="/content/hf_tmp")
                    shutil.move(tmp, local)
                    got = True
                except Exception as e:
                    log(f"  Hugging Face download failed ({e}); trying the Drive cache")
            cached = os.path.join(MODELS, sub, name)
            if not got and os.path.exists(cached):
                log(f"copying {name} from the Drive cache ...")
                shutil.copy(cached, local)
                got = True
            if not got:
                log(f"WARNING: could not get {sub}/{name}")
                continue
            # keep a Drive copy as a fallback for future sessions
            if not os.path.exists(cached):
                try:
                    os.makedirs(os.path.dirname(cached), exist_ok=True)
                    shutil.copy(local, cached)
                except OSError:
                    pass
        if os.path.realpath(dst) != os.path.realpath(local):
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            if os.path.lexists(dst):
                os.remove(dst)
            os.symlink(local, dst)
            changed = True
        log(f"model ready (local): {sub}/{name}")
    return changed

def restart_comfy():
    subprocess.run(["pkill", "-f", "main.py --listen 127.0.0.1 --port 8188"])
    for _ in range(30):
        if not comfy_up():
            break
        time.sleep(1)
    ensure_comfy()

def requeue_interrupted():
    """A job left 'running' by a previous session never finished: put it back in the queue."""
    for fn in os.listdir(D["status"]):
        if not fn.endswith(".json") or fn == "heartbeat.json":
            continue
        p = os.path.join(D["status"], fn)
        try:
            st = read_json(p)
        except (OSError, ValueError):
            continue
        if st.get("state") == "running":
            st.update(state="queued", note="requeued after an interrupted session", updated=now_iso())
            write_json(p, st)
            log(f"requeued interrupted job {st.get('id', fn[:-5])}")

def write_summary(key):
    """Human/Claude-readable list of every node and its inputs, used to author the .map.json."""
    api_path, _ = template_paths(key)
    if not os.path.exists(api_path):
        return
    api = read_json(api_path)
    summary = {nid: {"class": n.get("class_type"), "title": n.get("_meta", {}).get("title"),
                     "inputs": {k: v for k, v in n.get("inputs", {}).items() if not isinstance(v, list)}}
               for nid, n in api.items()}
    write_json(api_path.replace(".api.json", ".summary.json"), summary)

def build_prompt(job):
    key = job.get("template", "t2v")
    if key not in TEMPLATES:
        raise ValueError(f"unknown template '{key}' (use t2v, i2v or flf2v)")
    api_path, map_path = template_paths(key)
    if not os.path.exists(map_path):
        raise RuntimeError(f"no parameter map for {key} yet ({map_path})")
    api, pmap = read_json(api_path), read_json(map_path)
    defaults = pmap.get("defaults", {})
    params = {**defaults, **{k: v for k, v in job.items() if v is not None}}
    folder = out_folder(job)
    os.makedirs(os.path.join(D["outputs"], folder), exist_ok=True)
    params["filename_prefix"] = f"outputs/{folder}/{job['id']}"
    if "seed" not in job or job.get("seed") is None:
        params["seed"] = int.from_bytes(os.urandom(6), "big")
    for p in ("image", "last_image"):
        if params.get(p):
            params[p] = stage_input(params[p])
    for target in pmap["params"]:
        name = target["param"]
        if name not in params:
            if target.get("required"):
                raise ValueError(f"job is missing '{name}' (needed by {key})")
            continue
        val = params[name]
        if "scale" in target:
            val = type(val)(val * target["scale"])
        api[target["node"]]["inputs"][target["input"]] = val
    # "Preview as Text" nodes only display the enhanced prompt; as output nodes they would force
    # the prompt-enhancer model to run on every job. Drop them unless enhancement is on.
    if not params.get("prompt_enhance"):
        for nid in [nid for nid, n in api.items() if n.get("class_type") == "PreviewAny"]:
            del api[nid]
    for nid, inputs in (job.get("overrides") or {}).items():  # v10: raw node overrides for tests
        api[nid]["inputs"].update(inputs)
    return api, params

def stage_input(rel):
    src = rel if os.path.isabs(rel) else os.path.join(MEDIA, rel)
    if not os.path.exists(src):
        raise FileNotFoundError(f"asset not found: {rel}")
    dst_dir = os.path.join(COMFY_DIR, "input")
    os.makedirs(dst_dir, exist_ok=True)
    name = os.path.basename(src)
    shutil.copy(src, os.path.join(dst_dir, name))
    return name


# ---------- output folders + QC (v8) ----------
FOLDER_RULES = (("-e1-", "ensemble-e1"), ("-h1-", "hero-h1"), ("-a1-", "spots-a1"), ("-broll-", "broll"),
                ("-01-a-", "ugc/rep-a"), ("-02-b-", "ugc/rep-b"), ("-03-c-", "ugc/rep-c"), ("ugc", "ugc"))

def out_folder(job):
    """Subfolder of outputs/ for a job: its 'folder' field, else a rule on its id."""
    if job.get("folder"):
        return job["folder"].strip("/")
    jid = job.get("id", "")
    if job.get("type") == "voice" or "-voice-" in jid:
        return "voice"
    for key, folder in FOLDER_RULES:
        if key in jid:
            return folder
    return "tests"

def _ff(args):
    return subprocess.run(args, capture_output=True, text=True)

def qc_file(full):
    """Quick technical QC; for videos also writes <name>_sheet.jpg (6 frames side by side)."""
    r, flags = {}, []
    if full.endswith(".mp4"):
        pr = json.loads(_ff(["ffprobe", "-v", "error", "-show_entries",
                             "stream=codec_type,width,height:format=duration", "-of", "json", full]).stdout or "{}")
        streams = pr.get("streams", [])
        v = next((s for s in streams if s.get("codec_type") == "video"), {})
        dur = float(pr.get("format", {}).get("duration", 0) or 0)
        r.update(width=v.get("width"), height=v.get("height"), duration=round(dur, 2),
                 audio=any(s.get("codec_type") == "audio" for s in streams))
        if dur > 0:
            _ff(["ffmpeg", "-v", "error", "-y", "-i", full, "-vf",
                 f"fps={6 / dur:.4f},scale=320:-2,tile=6x1", "-frames:v", "1", full[:-4] + "_sheet.jpg"])
            if "freeze_start" in _ff(["ffmpeg", "-i", full, "-vf", "freezedetect=n=0.003:d=1.5",
                                      "-map", "0:v:0", "-f", "null", "-"]).stderr:
                flags.append("frozen video")
        if not r["audio"]:
            flags.append("no audio track")
    m = re.search(r"mean_volume: (-?[\d.]+) dB",
                  _ff(["ffmpeg", "-i", full, "-af", "volumedetect", "-vn", "-f", "null", "-"]).stderr)
    if m:
        r["mean_db"] = float(m.group(1))
        if r["mean_db"] < -50:
            flags.append("near-silent audio")
    r["flags"] = flags
    return r

def qc_outputs(files):
    out = {}
    for rel in files:
        try:
            out[os.path.basename(rel)] = qc_file(os.path.join(MEDIA, rel))
        except Exception as e:
            out[os.path.basename(rel)] = {"flags": [f"qc error: {e}"]}
    return out

# ---------- still images: Qwen-Image-Edit-2511 (v9) ----------
TEMPLATE_RAW = "https://raw.githubusercontent.com/Comfy-Org/workflow_templates/main/templates"
ASPECTS = {"9:16": (768, 1344), "16:9": (1344, 768), "4:5": (896, 1120), "1:1": (1024, 1024), "4:3": (1152, 864)}

def ensure_workflow_files():
    """Template UI workflows the exporter needs, downloaded once per session."""
    wf_dir = os.path.join(COMFY_DIR, "user", "default", "workflows")
    os.makedirs(wf_dir, exist_ok=True)
    for name in TEMPLATES.values():
        path = os.path.join(wf_dir, f"{name}.json")
        if os.path.exists(path):
            continue
        with urllib.request.urlopen(f"{TEMPLATE_RAW}/{name}.json", timeout=60) as r:
            wf = json.load(r)
        for sg in wf.get("definitions", {}).get("subgraphs", []):  # export with the 4-step LoRA on
            for n in sg.get("nodes", []):
                if n.get("type") == "PrimitiveBoolean" and "LoRA" in (n.get("title") or ""):
                    n["widgets_values"] = [True]
        with open(path, "w") as f:
            json.dump(wf, f)

def template_model_urls():
    """name -> (repo, path) for every model a template lists with a Hugging Face URL."""
    found = {}
    wf_dir = os.path.join(COMFY_DIR, "user", "default", "workflows")
    for name in TEMPLATES.values():
        path = os.path.join(wf_dir, f"{name}.json")
        if not os.path.exists(path):
            continue
        for m in re.finditer(r"https://huggingface\.co/([^/]+/[^/]+)/resolve/main/([^\"?)\s]+)", open(path).read()):
            found[os.path.basename(m.group(2))] = (m.group(1), m.group(2))
    return found

def _find(api, class_type, title_part=None):
    for nid, n in api.items():
        if n.get("class_type") == class_type and (title_part is None or title_part in (n.get("_meta", {}).get("title") or "")):
            return nid
    return None

def make_still_inputs(job, jid):
    """Reference crop + a canvas of the target shape (blurred fill, reference centred) for the edit model."""
    from PIL import Image, ImageFilter
    src = job["ref"] if os.path.isabs(job["ref"]) else os.path.join(MEDIA, job["ref"])
    if not os.path.exists(src):
        raise FileNotFoundError(f"reference not found: {job['ref']}")
    ref = Image.open(src).convert("RGB")
    crop = job.get("ref_crop")
    if crop in ("tl", "tr", "bl", "br"):
        w, h = ref.size
        x0 = 0 if crop[1] == "l" else w // 2
        y0 = 0 if crop[0] == "t" else h // 2
        ref = ref.crop((x0, y0, x0 + w // 2, y0 + h // 2))
    W, H = ASPECTS.get(job.get("aspect", "9:16"), ASPECTS["9:16"])
    scale = max(W / ref.width, H / ref.height)
    bg = ref.resize((int(ref.width * scale) + 1, int(ref.height * scale) + 1)).filter(ImageFilter.GaussianBlur(40))
    bg = bg.crop(((bg.width - W) // 2, (bg.height - H) // 2, (bg.width - W) // 2 + W, (bg.height - H) // 2 + H))
    fit = min(W / ref.width, H / ref.height) * 0.92
    fg = ref.resize((int(ref.width * fit), int(ref.height * fit)))
    bg.paste(fg, ((W - fg.width) // 2, H - fg.height))
    in_dir = os.path.join(COMFY_DIR, "input")
    os.makedirs(in_dir, exist_ok=True)
    ref.save(os.path.join(in_dir, f"{jid}_ref.png"))
    bg.save(os.path.join(in_dir, f"{jid}_canvas.png"))
    return f"{jid}_canvas.png", f"{jid}_ref.png"

def build_t2i_prompt(job, jid):
    """No reference: text to image with Z-Image-Turbo (8 steps)."""
    api = read_json(template_paths("t2i")[0])
    enc = _find(api, "CLIPTextEncode")
    lat = _find(api, "EmptySD3LatentImage")
    ks = _find(api, "KSampler")
    save = _find(api, "SaveImage") or _find(api, "SaveImageAdvanced")
    if not all((enc, lat, ks, save)):
        raise RuntimeError("t2i template is missing an expected node")
    W, H = ASPECTS.get(job.get("aspect", "4:5"), ASPECTS["4:5"])
    api[enc]["inputs"]["text"] = job["prompt"]
    api[lat]["inputs"].update(width=W, height=H, batch_size=1)
    seed = int(job["seed"]) if job.get("seed") is not None else int.from_bytes(os.urandom(6), "big")
    api[ks]["inputs"]["seed"] = seed
    folder = out_folder(job)
    os.makedirs(os.path.join(D["outputs"], folder), exist_ok=True)
    api[save]["inputs"]["filename_prefix"] = f"outputs/{folder}/{jid}"
    return api, {"seed": seed}

def build_still_prompt(job, jid):
    if not job.get("ref"):
        return build_t2i_prompt(job, jid)
    api = read_json(template_paths("edit")[0])
    canvas, ref = make_still_inputs(job, jid)
    load = _find(api, "LoadImage")
    pos = _find(api, "TextEncodeQwenImageEditPlus", "Positive")
    neg = next((nid for nid, n in api.items() if n.get("class_type") == "TextEncodeQwenImageEditPlus" and nid != pos), None)
    ks = _find(api, "KSampler")
    save = _find(api, "SaveImageAdvanced") or _find(api, "SaveImage")
    if not all((load, pos, ks, save)):
        raise RuntimeError("edit template is missing an expected node")
    api[load]["inputs"]["image"] = canvas
    api["9001"] = {"class_type": "LoadImage", "inputs": {"image": ref}, "_meta": {"title": "Identity reference"}}
    for enc in (pos, neg):
        if enc:
            api[enc]["inputs"]["image2"] = ["9001", 0]
    api[pos]["inputs"]["prompt"] = job["prompt"]
    seed = int(job["seed"]) if job.get("seed") is not None else int.from_bytes(os.urandom(6), "big")
    s = api[ks]["inputs"].get("seed")
    if isinstance(s, list):  # seed fed by a primitive node
        api[s[0]]["inputs"]["value"] = seed
    else:
        api[ks]["inputs"]["seed"] = seed
    for nid, n in api.items():  # turn the 4-step Lightning LoRA on
        if n.get("class_type") == "PrimitiveBoolean" and "LoRA" in (n.get("_meta", {}).get("title") or ""):
            n["inputs"]["value"] = True
    folder = out_folder(job)
    os.makedirs(os.path.join(D["outputs"], folder), exist_ok=True)
    api[save]["inputs"]["filename_prefix"] = f"outputs/{folder}/{jid}"
    return api, {"seed": seed}

def render_still(job, jid, t0):
    prompt, params = build_still_prompt(job, jid)
    resp = http_json("/prompt", {"prompt": prompt, "client_id": CLIENT_ID})
    if resp.get("node_errors"):
        raise RuntimeError("ComfyUI rejected the still workflow: " + json.dumps(resp["node_errors"])[:1500])
    pid = resp["prompt_id"]
    while True:
        hist = http_json(f"/history/{pid}")
        if pid in hist:
            entry = hist[pid]
            st = entry.get("status", {})
            if st.get("status_str") == "error":
                msgs = [m for m in st.get("messages", []) if m[0] == "execution_error"]
                raise RuntimeError("still failed: " + json.dumps(msgs)[:1500])
            return output_files(entry), params
        if time.time() - t0 > JOB_TIMEOUT_MIN * 60:
            raise TimeoutError(f"no result after {JOB_TIMEOUT_MIN} min")
        time.sleep(3)

# ---------- jobs ----------
def status_path(jid):
    return os.path.join(D["status"], f"{jid}.json")

def set_status(jid, **kw):
    path = status_path(jid)
    cur = read_json(path) if os.path.exists(path) else {"id": jid}
    cur.update(kw, updated=now_iso())
    write_json(path, cur)

def pending_jobs():
    out = []
    for fn in sorted(os.listdir(D["jobs"])):
        if not fn.endswith(".json"):
            continue
        path = os.path.join(D["jobs"], fn)
        try:
            jid = read_json(path).get("id") or fn[:-5]
        except (OSError, ValueError):
            continue  # file still syncing from Drive; try next poll
        st = status_path(jid)
        try:
            if os.path.exists(st) and read_json(st).get("state") in ("running", "done", "failed"):
                continue
        except (OSError, ValueError):
            continue
        out.append(path)
    return out

def output_files(history_entry):
    files = []
    for node_out in history_entry.get("outputs", {}).values():
        for key in ("videos", "images", "gifs", "audio"):
            for f in node_out.get(key, []) or []:
                if f.get("type") == "output":
                    files.append(os.path.join(f.get("subfolder", ""), f["filename"]))
    return files

def drive_links(files, wait_s=0):
    """Drive 'view' links for outputs, read from the Drive mount's xattr (no search/index lag).
    Until the mount finishes uploading a file its ID is a placeholder ('local-N'); those are skipped."""
    links, deadline = [], time.time() + wait_s
    for rel in files:
        full = os.path.join(MEDIA, rel)
        while True:
            try:
                fid = os.getxattr(full, "user.drive.id").decode()
                if not fid.startswith("local"):
                    links.append(f"https://drive.google.com/file/d/{fid}/view")
                    break
            except OSError as e:
                if e.errno in (95, 1):  # not supported on this filesystem / not permitted
                    return links
            if time.time() > deadline:
                break
            time.sleep(5)
    return links

def backfill_links(jid, files):
    """Runs in a background thread: once Drive has the real file IDs, add the links to the status file."""
    links = drive_links(files, wait_s=600)
    if links:
        set_status(jid, links=links)
        log(f"job {jid}: links ready")

# ---------- voice jobs (Chatterbox TTS in its own environment) ----------
TTS_ENV = _g("TTS_ENV", "/content/tts_env")
TTS_OUT = "/content/tts_out"

def run_with_heartbeat(cmd, jid, t0, timeout_s, what):
    """Run a long subprocess while keeping the heartbeat and status file fresh."""
    logf = open(f"/content/{what}.log", "a")
    proc = subprocess.Popen(cmd, stdout=logf, stderr=subprocess.STDOUT)
    last = 0
    while proc.poll() is None:
        if time.time() - t0 > timeout_s:
            proc.kill()
            raise TimeoutError(f"{what} took more than {timeout_s // 60} min")
        if time.time() - last >= 30:
            set_status(jid, state="running", elapsed_s=int(time.time() - t0), step=what)
            heartbeat(f"{what} for {jid}")
            last = time.time()
        time.sleep(1)
    if proc.returncode != 0:
        tail = subprocess.run(["tail", "-n", "30", f"/content/{what}.log"], capture_output=True, text=True).stdout
        raise RuntimeError(f"{what} failed:\n{tail}")

def ensure_tts_env(jid, t0):
    py = os.path.join(TTS_ENV, "bin", "python")
    if os.path.exists(py) and subprocess.run([py, "-c", "import chatterbox, pkg_resources"], capture_output=True).returncode == 0:
        return py
    log("installing Chatterbox in its own environment (first voice job this session, a few minutes) ...")
    if not os.path.exists(py):
        if subprocess.run([sys.executable, "-m", "venv", TTS_ENV], capture_output=True).returncode != 0:
            subprocess.run([sys.executable, "-m", "pip", "install", "-q", "virtualenv"], check=True)
            subprocess.run([sys.executable, "-m", "virtualenv", TTS_ENV], check=True)
    run_with_heartbeat([py, "-m", "pip", "install", "-q", "chatterbox-tts", "setuptools<81"], jid, t0, 20 * 60, "chatterbox-install")
    return py

def render_voice(job, jid, t0):
    if not job.get("text"):
        raise ValueError("voice job needs 'text'")
    py = ensure_tts_env(jid, t0)
    try:  # hand the GPU memory ComfyUI is holding back before loading the voice model
        http_json("/free", {"unload_models": True, "free_memory": True})
    except Exception:
        pass
    vpath = None
    if job.get("voice"):
        vpath = job["voice"] if os.path.isabs(job["voice"]) else os.path.join(MEDIA, job["voice"])
        if not os.path.exists(vpath):
            raise FileNotFoundError(f"voice reference not found: {job['voice']}")
    os.makedirs(TTS_OUT, exist_ok=True)
    params = {"text": job["text"], "model": job.get("model", "turbo"), "voice": vpath,
              "takes": int(job.get("takes", 3)),
              "seed": int(job["seed"]) if job.get("seed") is not None else int.from_bytes(os.urandom(4), "big"),
              "exaggeration": job.get("exaggeration", 0.5), "cfg_weight": job.get("cfg_weight", 0.5),
              "out_prefix": os.path.join(TTS_OUT, jid), "result": os.path.join(TTS_OUT, f"{jid}.json")}
    spec_path = os.path.join(TTS_OUT, f"{jid}.spec.json")
    write_json(spec_path, params)
    run_with_heartbeat([py, os.path.join(SYS_DIR, "tts_runner.py"), spec_path], jid, t0,
                       JOB_TIMEOUT_MIN * 60, "voice-render")
    files = []
    for f in read_json(params["result"])["files"]:
        os.makedirs(os.path.join(D["outputs"], out_folder(job)), exist_ok=True)
        dst = os.path.join(D["outputs"], out_folder(job), os.path.basename(f))
        shutil.copy(f, dst)
        files.append(os.path.relpath(dst, MEDIA))
    return files, params

def render_video(job, jid, t0):
    prompt, params = build_prompt(job)
    resp = http_json("/prompt", {"prompt": prompt, "client_id": CLIENT_ID})
    if resp.get("node_errors"):
        raise RuntimeError("ComfyUI rejected the workflow: " + json.dumps(resp["node_errors"])[:1500])
    pid = resp["prompt_id"]
    while True:
        hist = http_json(f"/history/{pid}")
        if pid in hist:
            entry = hist[pid]
            st = entry.get("status", {})
            if st.get("status_str") == "error":
                msgs = [m for m in st.get("messages", []) if m[0] == "execution_error"]
                raise RuntimeError("render failed: " + json.dumps(msgs)[:1500])
            break
        if time.time() - t0 > JOB_TIMEOUT_MIN * 60:
            raise TimeoutError(f"no result after {JOB_TIMEOUT_MIN} min")
        if int(time.time() - t0) // 5 % 6 == 0:  # every ~30 s
            set_status(jid, state="running", elapsed_s=int(time.time() - t0))
            heartbeat(f"rendering {jid}")
        time.sleep(5)
    return output_files(entry), params

def run_job(path):
    job = read_json(path)
    jid = job.setdefault("id", os.path.basename(path)[:-5])
    t0 = time.time()
    kind = job.get("type") if job.get("type") in ("voice", "still") else job.get("template", "t2v")
    set_status(jid, state="running", started=now_iso(), title=job.get("title"), template=kind)
    log(f"job {jid}: {job.get('title') or (job.get('prompt') or job.get('text') or '')[:60]}")
    try:
        if job.get("type") == "voice":
            files, params = render_voice(job, jid, t0)
        elif job.get("type") == "still":
            files, params = render_still(job, jid, t0)
        else:
            files, params = render_video(job, jid, t0)
        secs = int(time.time() - t0)
        cu = secs / 3600 * CU_PER_HOUR.get(GPU_KEY, 0)
        set_status(jid, state="done", finished=now_iso(), seconds=secs, outputs=files,
                   links=drive_links(files), seed=params.get("seed"), est_units=round(cu, 3),
                   qc=qc_outputs(files))
        append_manifest(jid, job, params, files, secs, cu)
        threading.Thread(target=backfill_links, args=(jid, files), daemon=True).start()
        log(f"job {jid}: done in {secs}s -> {files}")
    except Exception as e:
        set_status(jid, state="failed", finished=now_iso(), error=str(e)[:2000])
        log(f"job {jid}: FAILED: {e}")
        traceback.print_exc()

def append_manifest(jid, job, params, files, secs, cu):
    path = os.path.join(D["outputs"], "manifest.csv")
    new = not os.path.exists(path)
    with open(path, "a", newline="") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["finished", "id", "title", "template", "file", "prompt", "seed", "width", "height",
                        "duration", "seconds", "est_units", "tags", "requested_by", "approved"])
        for fp in files or [""]:
            w.writerow([now_iso(), jid, job.get("title", ""), "voice" if job.get("type") == "voice" else job.get("template", "t2v"),
                        fp, job.get("prompt") or job.get("text", ""),
                        params.get("seed"), params.get("width"), params.get("height"), params.get("duration"),
                        secs, round(cu, 3), ",".join(job.get("tags", [])), job.get("requested_by", ""), ""])

# ---------- heartbeat / lifecycle ----------
_last_active = time.time()

HEARTBEAT = os.path.join(D["status"], "heartbeat.json")  # created by Claude so its Drive ID is known

def heartbeat(activity):
    write_json(HEARTBEAT, {
        "alive_at": now_iso(), "alive_epoch": int(time.time()), "activity": activity, "gpu": GPU_KEY,
        "session_minutes": int((time.time() - SESSION_START) / 60),
        "idle_minutes": int((time.time() - _last_active) / 60),
        "auto_stop_after_idle_min": IDLE_MINUTES, "max_session_hours": MAX_SESSION_HOURS,
        "templates_ready": [k for k in TEMPLATES if os.path.exists(template_paths(k)[1])],
    })

def stop_runtime(reason):
    hours = (time.time() - SESSION_START) / 3600
    cu = hours * CU_PER_HOUR.get(GPU_KEY, 0)
    msg = f"stopped: {reason}; session {hours*60:.0f} min, ~{cu:.2f} units (~${cu*USD_PER_CU:.2f})"
    write_json(HEARTBEAT, {"alive_at": now_iso(), "alive_epoch": int(time.time()), "activity": msg, "stopped": True})
    log(msg)
    from google.colab import runtime
    runtime.unassign()

def main():
    global _last_active
    requeue_interrupted()
    templates_cached = all(os.path.exists(template_paths(k)[0]) for k in TEMPLATES)
    if not templates_cached:          # exporting needs a running ComfyUI
        ensure_comfy()
        ensure_templates()
    else:
        ensure_templates()            # just refreshes summaries
    if ensure_models() and comfy_up():
        log("restarting ComfyUI so it loads models from local disk")
        restart_comfy()
    else:
        ensure_comfy()
    ready = [k for k in TEMPLATES if os.path.exists(template_paths(k)[1])]
    log(f"worker running. templates with maps: {ready or 'none yet'}. "
        f"Auto-stop after {IDLE_MINUTES} idle min or {MAX_SESSION_HOURS} h. Interrupt to stop the worker only.")
    while True:
        jobs = pending_jobs()
        if jobs:
            ensure_comfy()
            for p in jobs:
                os.path.exists(p) and run_job(p)
                _last_active = time.time()
        heartbeat("idle, watching jobs/")
        if (time.time() - _last_active) / 60 >= IDLE_MINUTES:
            return stop_runtime(f"idle {IDLE_MINUTES} min")
        if (time.time() - SESSION_START) / 3600 >= MAX_SESSION_HOURS:
            return stop_runtime(f"session cap {MAX_SESSION_HOURS} h")
        time.sleep(POLL_SECONDS)

main()
