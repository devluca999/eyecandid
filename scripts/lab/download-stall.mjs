// Proves the first-visit model download survives a bad connection, in a real Chrome (real GPU) with a FRESH profile
// (empty cache): landing → drop → the model downloads with an injected stall → retries, resumes → the edit is ready.
// From apps/web with the site running:  node ../../scripts/lab/download-stall.mjs <clip.mp4>
//   BASE=http://127.0.0.1:3100   the site
//   LAB_STALL=40000000           byte offset where the first read hangs once ("eyelore.lab-stall"; 0 = no stall)
//   LAB_KBPS=20000               throttle the download (Chrome network emulation), kbit/s; unset = no throttle
//   LAB_ENGINE=wasm              the CPU transcriber's download instead of WebGPU's
//   LAB_PROFILE=<dir>            reuse a profile (default: a new empty one each run)
//   LAB_OFFLINE_AT=<s>           go offline this many seconds after the drop (the retries give up), then
//   LAB_ONLINE_AFTER=<s>         come back online after that many more seconds and press "try again"
import { chromium } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const clip = process.argv[2];
const profile = process.env.LAB_PROFILE ?? mkdtempSync(join(process.env.TMPDIR ?? tmpdir(), "eyecandid-fresh-"));
const ctx = await chromium.launchPersistentContext(profile, { headless: false, args: ["--enable-unsafe-webgpu"] });
const page = ctx.pages()[0] ?? (await ctx.newPage());
const t0 = Date.now();
const s = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";
page.on("console", (m) => {
  const x = m.text();
  if (x.startsWith("[model]") || x.startsWith("[asr]") || x.startsWith("[device]")) console.log(s(), x.slice(0, 400));
  if (m.type() === "error") console.log(s(), "CONSOLE.ERROR", x.slice(0, 300));
});
page.on("pageerror", (e) => console.log(s(), "PAGEERROR", e.message.slice(0, 200)));
const hooks = { "eyelore.lab": "1", ...(process.env.LAB_ENGINE ? { "eyelore.engine": process.env.LAB_ENGINE } : {}) };
const stall = process.env.LAB_STALL ?? "40000000";
if (stall !== "0") hooks["eyelore.lab-stall"] = stall;
await page.addInitScript((h) => { for (const [k, v] of Object.entries(h)) localStorage.setItem(k, v); }, hooks);
const cdp = await ctx.newCDPSession(page);
const net = async (offline) => {
  const kbps = Number(process.env.LAB_KBPS ?? 0);
  await cdp.send("Network.emulateNetworkConditions", { offline, latency: kbps ? 40 : 0, downloadThroughput: kbps ? (kbps * 1000) / 8 : -1, uploadThroughput: -1 });
};
await cdp.send("Network.enable");
// every model-file request, with its Range header: a resume shows as "bytes=<offset>-"
cdp.on("Network.requestWillBeSent", (e) => {
  const u = e.request.url;
  if (/\.onnx(\?|$)/.test(u)) console.log(s(), "GET", u.split("/").slice(-2).join("/"), e.request.headers.Range ?? e.request.headers.range ?? "(whole file)");
});
await net(false);

const BASE = process.env.BASE ?? "http://127.0.0.1:3100";
await page.goto(BASE + "/");
console.log(s(), "profile", profile, "· cache entries before:", await page.evaluate(async () => (await (await caches.open("transformers-cache")).keys()).length));
await page.locator('[data-testid="file-input"][data-ready="1"]').waitFor({ state: "attached", timeout: 60000 });
const tDrop = Date.now();
await page.getByTestId("file-input").setInputFiles(clip);
await page.waitForURL(/\/edit\//, { timeout: 60000 });
console.log(s(), "editor open", page.url());
let last = "";
let sawPlaying = false;
let wentOffline = false;
let cameBack = false;
let reloaded = false;
const offAt = process.env.LAB_OFFLINE_AT ? Number(process.env.LAB_OFFLINE_AT) : null;
for (let i = 0; i < 2400; i++) {
  const since = (Date.now() - tDrop) / 1000;
  if (offAt !== null && !wentOffline && since >= offAt) {
    wentOffline = true;
    await net(true);
    console.log(s(), "NETWORK OFFLINE");
  }
  const ex = await page.getByTestId("explain").innerText().catch(() => "");
  if (ex !== last) {
    console.log(s(), "line:", ex.replace(/\s+/g, " ").slice(0, 160));
    last = ex;
  }
  if (!sawPlaying) {
    const v = await page.evaluate(() => { const v = document.querySelector('[data-testid="footage"]'); return v ? { paused: v.paused, muted: v.muted, t: v.currentTime } : null; }).catch(() => null);
    if (v && !v.paused && v.t > 0) { sawPlaying = true; console.log(s(), "raw take playing during the download · muted:", v.muted); }
  }
  if (wentOffline && !cameBack && (await page.getByTestId("retry-device").isVisible().catch(() => false))) {
    await page.waitForTimeout(Number(process.env.LAB_ONLINE_AFTER ?? 2) * 1000);
    await net(false);
    cameBack = true;
    console.log(s(), "NETWORK BACK · pressing try again");
    await page.getByTestId("retry-device").click();
  }
  // LAB_RELOAD_AT=<s>: reload mid-download (the clip leaves this tab), check the frame is plain, choose the clip again
  if (process.env.LAB_RELOAD_AT && !reloaded && since >= Number(process.env.LAB_RELOAD_AT)) {
    reloaded = true;
    await page.reload();
    await page.getByTestId("choose-again").waitFor({ timeout: 30000 });
    const look = await page.evaluate(() => ({ plainFrame: !!document.querySelector('[data-testid="no-clip"]'), footage: !!document.querySelector('[data-testid="footage"]') }));
    console.log(s(), "RELOADED · line:", (await page.getByTestId("explain").innerText()).replace(/\s+/g, " "), "·", (await page.getByTestId("choose-again").innerText()).replace(/\s+/g, " "), "·", JSON.stringify(look));
    await page.screenshot({ path: process.env.LAB_SHOT ?? "/dev/null" }).catch(() => {});
    await page.getByTestId("choose-again").locator('input[type="file"]').setInputFiles(clip);
    console.log(s(), "chose the clip again");
  }
  if (await page.getByTestId("thread").isVisible().catch(() => false)) break;
  await page.waitForTimeout(250);
}
const ready = await page.getByTestId("thread").isVisible().catch(() => false);
console.log(s(), ready ? `EDIT READY · drop→ready ${((Date.now() - tDrop) / 1000).toFixed(1)}s` : "NOT READY");
console.log("struck words:", await page.getByTestId("struck-word").count());
const v = await page.evaluate(() => { const v = document.querySelector('[data-testid="footage"]'); return v ? { paused: v.paused, muted: v.muted } : null; });
console.log("after ready, footage:", JSON.stringify(v));
console.log("cache entries after:", await page.evaluate(async () => { const c = await caches.open("transformers-cache"); const out = []; for (const r of await c.keys()) out.push(r.url.split("/").slice(-2).join("/") + " " + (await c.match(r)).headers.get("content-length")); return out; }));
if (process.env.LAB_KEEP) await page.waitForTimeout(Number(process.env.LAB_KEEP) * 1000);
await ctx.close();
