// Proves the on-device path end to end in a real Chrome window (real GPU): landing → drop → edit → export → download.
// From apps/web with `pnpm start` running:  node ../../scripts/lab/device-flow.mjs <clip.mp4> <out.mp4>
import { chromium } from "@playwright/test";
const clip = process.argv[2];
const ctx = await chromium.launchPersistentContext("/private/tmp/claude-502/lab-profile", { headless: false, acceptDownloads: true, args: ["--enable-unsafe-webgpu"] });
const page = ctx.pages()[0] ?? await ctx.newPage();
let reframed = false;
page.on("console", (m) => {
  if (m.text().includes("[reframe]")) { reframed = true; console.log(s(), "CONSOLE", m.text().slice(0, 200)); }
  // the export quality check's measured cost and verdict (Editor.tsx deviceExporter)
  if (m.text().startsWith("[qc]")) console.log(s(), "QC", m.text().slice(5, 600));
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
