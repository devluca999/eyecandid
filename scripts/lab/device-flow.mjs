// Proves the on-device path end to end in a real Chrome window (real GPU): landing → drop → edit → export → download.
// From apps/web with `pnpm start` running:  node ../../scripts/lab/device-flow.mjs <clip.mp4> <out.mp4>
import { chromium } from "@playwright/test";
const clip = process.argv[2];
// LAB_PROFILE: a profile dir of your own when another run may hold the default one
const ctx = await chromium.launchPersistentContext(process.env.LAB_PROFILE ?? "/private/tmp/claude-502/lab-profile", { headless: false, acceptDownloads: true, args: ["--enable-unsafe-webgpu"] });
const page = ctx.pages()[0] ?? await ctx.newPage();
let reframed = false;
page.on("console", (m) => {
  if (m.text().includes("[reframe]")) { reframed = true; console.log(s(), "CONSOLE", m.text().slice(0, 200)); }
  if (m.text().includes("[sound]")) console.log(s(), "CONSOLE", m.text().slice(0, 600)); // the export's mix and loudness
});
page.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 200)));
var t0 = Date.now(); var s = () => ((Date.now() - t0) / 1000).toFixed(1) + "s";
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
await dl.waitFor({ timeout: 300000 });
console.log(s(), "export ready (render", ((Date.now() - t2) / 1000).toFixed(1) + "s; drop→export", ((Date.now() - t1) / 1000).toFixed(1) + "s)");
const [download] = await Promise.all([page.waitForEvent("download"), dl.click()]);
await download.saveAs(process.argv[3]); console.log("saved", process.argv[3]);
await ctx.close();
