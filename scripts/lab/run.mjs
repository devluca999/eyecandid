// Drives /lab/local in a real Chrome window (real GPU) on a clip and saves the export. From apps/web:
//   node ../../scripts/lab/run.mjs <clip.mp4> <out.mp4> [tiny.en|base.en|small.en]   (needs `pnpm start` running)
import { chromium } from "@playwright/test";
const clip = process.argv[2];
const browser = await chromium.launchPersistentContext("/private/tmp/claude-502/lab-profile", { headless: false, args: ["--enable-unsafe-webgpu", "--enable-features=WebGPU"] });
const page = browser.pages()[0] ?? await browser.newPage();
page.on("pageerror", (e) => console.log("PAGEERROR", e.message.slice(0, 200)));
await page.goto("http://127.0.0.1:3000/lab/local");
await page.waitForFunction(() => document.querySelector('[data-testid="caps"]')?.textContent?.includes("render"), null, { timeout: 60000 });
console.log("CAPS", (await page.getByTestId("caps").innerText()).replace(/\n/g, " | ").slice(0, 600));
const want = process.argv[4]; if (want) await page.locator("select").selectOption(want);
console.log("GPU", await page.evaluate(async () => { const a = await navigator.gpu?.requestAdapter(); return a ? JSON.stringify({ vendor: a.info?.vendor, arch: a.info?.architecture, fallback: a.isFallbackAdapter }) : "none"; }));
await page.getByTestId("lab-file").setInputFiles(clip);
await page.waitForFunction(() => /^(done|failed)/.test(document.querySelector('[data-testid="lab-status"]')?.textContent ?? ""), null, { timeout: 900000 });
console.log("STATUS", await page.getByTestId("lab-status").innerText());
console.log("STEPS\n" + await page.getByTestId("lab-steps").innerText());
const t = await page.getByTestId("lab-transcript").innerText().catch(() => "");
console.log("TRANSCRIPT", t.slice(0, 400));
const href = await page.getByTestId("lab-download").getAttribute("href").catch(() => null);
if (href) { const b = await page.evaluate(async (u) => { const r = await fetch(u); const a = new Uint8Array(await r.arrayBuffer()); let s=""; for (let i=0;i<a.length;i+=32768) s+=String.fromCharCode(...a.subarray(i,i+32768)); return btoa(s); }, href); (await import("node:fs")).writeFileSync(process.argv[3], Buffer.from(b, "base64")); console.log("SAVED", process.argv[3]); }
await browser.close();
