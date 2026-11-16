"""Export ComfyUI UI workflows to API-format JSON using ComfyUI's own frontend converter.

Runs on the Colab VM (ComfyUI must be up on 127.0.0.1:8188). Uses headless Chromium via
Playwright to load each workflow into the real frontend and call app.graphToPrompt(),
which is exactly what "Export (API)" does in the UI.

Usage: python export_templates.py <out_dir> <workflow_name> [<workflow_name> ...]
  workflow_name = file in ComfyUI/user/default/workflows without .json
"""
import json, os, sys, subprocess, urllib.request, urllib.parse

def ensure_playwright():
    try:
        import playwright  # noqa: F401
    except ImportError:
        subprocess.run([sys.executable, "-m", "pip", "install", "-q", "playwright"], check=True)
    subprocess.run([sys.executable, "-m", "playwright", "install", "--with-deps", "chromium"],
                   check=True, stdout=subprocess.DEVNULL)

def load_workflow(name):
    url = "http://127.0.0.1:8188/api/userdata/" + urllib.parse.quote(f"workflows/{name}.json", safe="")
    with urllib.request.urlopen(url, timeout=30) as r:
        return json.load(r)

def main():
    out_dir, names = sys.argv[1], sys.argv[2:]
    os.makedirs(out_dir, exist_ok=True)
    ensure_playwright()
    from playwright.sync_api import sync_playwright
    with sync_playwright() as p:
        browser = p.chromium.launch()
        page = browser.new_page()
        page.goto("http://127.0.0.1:8188/", wait_until="networkidle", timeout=120000)
        page.wait_for_function("window.app && window.app.graph", timeout=120000)
        for name in names:
            wf = load_workflow(name)
            page.evaluate("async (wf) => { await window.app.loadGraphData(wf, true, true); }", wf)
            api = page.evaluate("async () => (await window.app.graphToPrompt()).output")
            path = os.path.join(out_dir, f"{name}.api.json")
            with open(path, "w") as f:
                json.dump(api, f, indent=1)
            summary = {nid: n.get("class_type") for nid, n in api.items()}
            print(f"exported {name}: {len(api)} nodes -> {path}")
            print("  " + json.dumps(summary))
        browser.close()

if __name__ == "__main__":
    main()
