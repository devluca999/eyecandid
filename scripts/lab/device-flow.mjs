// Proves the on-device path end to end in a real Chrome window (real GPU): landing → drop → edit → export → download.
// From apps/web with `pnpm start` running:  node ../../scripts/lab/device-flow.mjs <clip.mp4> <out.mp4>
// LAB_ENGINE=wasm forces the CPU (WebAssembly) transcriber even though this Chrome has WebGPU (localStorage
// "eyelore.engine"); LAB_WASM_MODEL picks its Whisper build (e.g. tiny.en:q8, see apps/web/lib/asr-words.ts);
// STOP_AT_READY=1 ends the run once the edit is ready (no export). Cold = a fresh LAB_PROFILE; cached = the same one again.
import { chromium } from "@playwright/test";
const clip = process.argv[2];
// LAB_PROFILE: a profile dir of your own when another run may hold the default one
const ctx = await chromium.launchPersistentContext(process.env.LAB_PROFILE ?? "/private/tmp/claude-502/lab-profile", { headless: false, acceptDownloads: true, args: ["--enable-unsafe-webgpu"] });
const page = ctx.pages()[0] ?? await ctx.newPage();
let reframed = false;
page.on("console", (m) => {
  if (m.type() === "error") console.log(s(), "CONSOLE.ERROR", m.text().slice(0, 300));
  if (m.text().startsWith("[asr]")) console.log(s(), "ASR", m.text().slice(6, 1200)); // which transcriber listened, how long, the words
  if (m.text().includes("[reframe]")) { reframed = true; console.log(s(), "CONSOLE", m.text().slice(0, 200)); }
  if (m.text().includes("[sound]")) console.log(s(), "CONSOLE", m.text().slice(0, 600)); // the export's mix and loudness
  // the export quality check's measured cost and verdict (Editor.tsx deviceExporter)
  if (m.text().startsWith("[qc]")) console.log(s(), "QC", m.text().slice(5, 600));
});
page.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 200)));
var t0 = Date.now(); var s = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";
const hooks = { ...(process.env.LAB_ENGINE ? { "eyelore.engine": process.env.LAB_ENGINE } : {}), ...(process.env.LAB_WASM_MODEL ? { "eyelore.wasm-model": process.env.LAB_WASM_MODEL } : {}) };
await page.addInitScript((h) => { for (const [k, v] of Object.entries(h)) localStorage.setItem(k, v); }, hooks);
const BASE = process.env.BASE ?? "http://127.0.0.1:3000"; await page.goto(BASE + "/");
await page.locator('[data-testid="file-input"][data-ready="1"]').waitFor({ state: "attached", timeout: 30000 });
const t1 = Date.now();
await page.getByTestId("file-input").setInputFiles(clip);
await page.waitForURL(/\/edit\//, { timeout: 60000 });
console.log(s(), "editor open");
let last = "";
for (let i = 0; i < 240; i++) {
  const ex = await page.getByTestId("explain").innerText().catch(() => "");
  if (ex !== last) { console.log(s(), "explain:", ex.slice(0, 120)); last = ex; }
  if (await page.getByTestId("thread").isVisible().catch(() => false)) break;
  await page.waitForTimeout(500);
}
console.log(s(), "edit ready (drop→ready", ((Date.now() - t1) / 1000).toFixed(1) + "s)");
const struck = await page.getByTestId("struck-word").count();
console.log("struck words:", struck);
if (process.env.STOP_AT_READY) { await ctx.close(); process.exit(0); }
for (let i = 0; i < 240 && !reframed && !process.env.NO_WAIT_REFRAME; i++) await page.waitForTimeout(500);
if (process.env.ASPECT) await page.getByRole("radio", { name: process.env.ASPECT, exact: true }).click();
// ENERGY=1: turn the energy dial to full before exporting (punch-ins on the hook, best line and emphasised words)
if (process.env.ENERGY) {
  const energy = page.getByRole("slider", { name: "energy" });
  await energy.focus();
  await energy.press("End");
  await page.getByTestId("dials").getByRole("status", { name: "live" }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(1500);
  console.log(s(), "energy at full · explain:", (await page.getByTestId("explain").innerText().catch(() => "")).slice(0, 120));
  await page.locator("body").press("Escape");
}
const t2 = Date.now();
await page.getByTestId("export").click();
const dl = page.getByTestId("download");
// the quality check either delivers (download) or says why in the pill (export-check)
const check = page.getByTestId("export-check");
await dl.or(check).first().waitFor({ timeout: 300000 });
console.log(s(), "export decided (render+check", ((Date.now() - t2) / 1000).toFixed(1) + "s; drop→export", ((Date.now() - t1) / 1000).toFixed(1) + "s)");
const fixedLine = await page.getByTestId("qc-fixed").innerText().catch(() => "");
if (fixedLine) console.log("qc fixed:", fixedLine);
if (await check.isVisible().catch(() => false)) {
  console.log("qc check:", await check.getAttribute("data-kind"), "·", await check.innerText());
  if (!(await page.getByTestId("qc-anyway").isVisible().catch(() => false))) { await ctx.close(); process.exit(2); }
  await page.getByTestId("qc-anyway").click();
  await dl.waitFor({ timeout: 10000 });
}
const [download] = await Promise.all([page.waitForEvent("download"), dl.click()]);
await download.saveAs(process.argv[3]); console.log("saved", process.argv[3]);
await ctx.close();
