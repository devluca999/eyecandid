import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

const CLIP = fileURLToPath(new URL("../../../services/engine/tests/fixtures/talk.mp4", import.meta.url));
const PROD_HOST = "hushed-heron-814";
const RUNS = Math.max(1, Number(process.env.TIMING_RUNS ?? 3));

const p50 = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
};

/**
 * Phase 2 acceptance: drop → preview p50 <= 30 s, drop → export p50 <= 90 s.
 * Off unless TIMING=1. Needs a real cpu worker polling the same backend (as core-loop.spec.ts).
 * Refuses production Convex unless TIMING_ALLOW_PROD=1.
 */
test("timing: drop → preview p50 <= 30 s, drop → export p50 <= 90 s", async ({ browser }, info) => {
  test.skip(!process.env.TIMING, "timing spec: set TIMING=1 to run");
  test.skip(info.project.name !== "desktop", "one pipeline at a time on the single worker");
  const envUrl = process.env.NEXT_PUBLIC_CONVEX_URL ?? "";
  test.skip(envUrl.includes(PROD_HOST) && !process.env.TIMING_ALLOW_PROD, `NEXT_PUBLIC_CONVEX_URL is production (${PROD_HOST}); set TIMING_ALLOW_PROD=1 to allow`);
  test.setTimeout(RUNS * 300_000);

  const previews: number[] = [];
  const exports_: number[] = [];

  for (let i = 0; i < RUNS; i++) {
    const context = await browser.newContext({ baseURL: info.project.use.baseURL, viewport: { width: 1280, height: 800 } });
    const page = await context.newPage();
    // the app's Convex URL is inlined at build time; the websocket it opens is the one source that is always right
    const sockets: string[] = [];
    page.on("websocket", (ws) => sockets.push(ws.url()));
    await page.addInitScript(() => localStorage.setItem("eyelore.engine", "server")); // time the worker path
    await page.goto("/");
    await expect(page.getByTestId("file-input")).toHaveAttribute("data-ready", "1");
    if (!process.env.TIMING_ALLOW_PROD && sockets.some((u) => u.includes(PROD_HOST))) {
      await context.close();
      test.skip(true, `page talks to production Convex (${PROD_HOST}); set TIMING_ALLOW_PROD=1 to allow`);
    }

    const t0 = Date.now(); // the moment the file is chosen
    await page.getByTestId("file-input").setInputFiles(CLIP);
    await expect(page).toHaveURL(/\/edit\//);
    await expect(page.getByTestId("thread")).toBeVisible({ timeout: 120_000 });
    const tPreview = Date.now() - t0;

    const tour = page.getByTestId("tour-skip");
    if (await tour.isVisible().catch(() => false)) await tour.click();
    await page.getByRole("radio", { name: "9:16" }).click();
    await page.getByTestId("export").click();
    await expect(page.getByTestId("download")).toBeVisible({ timeout: 240_000 });
    const tExport = Date.now() - t0;

    previews.push(tPreview);
    exports_.push(tExport);
    console.log(`timing run ${i + 1}/${RUNS}: preview ${(tPreview / 1000).toFixed(1)}s, export ${(tExport / 1000).toFixed(1)}s`);
    await context.close();
  }

  const pp = p50(previews);
  const pe = p50(exports_);
  console.log(`timing p50 over ${RUNS} runs: preview ${(pp / 1000).toFixed(1)}s (<= 30s), export ${(pe / 1000).toFixed(1)}s (<= 90s)`);
  expect(pp).toBeLessThanOrEqual(30_000);
  expect(pe).toBeLessThanOrEqual(90_000);
});
