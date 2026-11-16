import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

const CLIP = fileURLToPath(new URL("../../../services/engine/tests/fixtures/talk.mp4", import.meta.url));

/**
 * Phase 2 exit criterion (web): landing → exported, captioned, reframed video in under 3 minutes of the user's time.
 * Needs a real CPU worker (transcribe + autocut + reframe + render) polling the same backend: E2E_REAL_WORKER=1.
 */
test("drop a raw clip → polished, captioned 9:16 export in under 3 minutes", async ({ page }, info) => {
  test.skip(!process.env.E2E_REAL_WORKER, "needs a real cpu worker (E2E_REAL_WORKER=1)");
  test.skip(info.project.name !== "desktop", "one pipeline at a time on the single CI worker");
  test.setTimeout(180_000);
  const t0 = Date.now();

  await page.goto("/");
  await page.getByTestId("file-input").setInputFiles(CLIP);
  await expect(page).toHaveURL(/\/edit\//);

  // the edit appears: beads with fillers struck through (not deleted)
  await expect(page.getByTestId("thread")).toBeVisible({ timeout: 120_000 });
  const struck = page.getByTestId("struck-word");
  await expect(struck.first()).toBeVisible();
  const before = await struck.count();
  await expect(page.getByTestId("explain")).toContainText(/trimmed/);

  // restore one: the reason is recorded, and it's no longer struck
  const word = (await struck.first().innerText()).trim();
  await struck.first().click();
  await expect(page.getByTestId("struck-word")).toHaveCount(before - 1);
  await page.getByTestId("thread").hover({ position: { x: 2, y: 2 } });

  // export 9:16 (watermarked, anonymous) and get a file
  await page.getByRole("radio", { name: "9:16" }).click();
  await page.getByTestId("export").click();
  const download = page.getByTestId("download");
  await expect(download).toBeVisible({ timeout: 170_000 - (Date.now() - t0) });
  const href = await download.getAttribute("href");
  expect(href).toMatch(/^https?:\/\//);
  const res = await page.request.get(href!);
  expect(res.ok()).toBe(true);
  expect((await res.body()).byteLength).toBeGreaterThan(20_000);

  const secs = (Date.now() - t0) / 1000;
  console.log(`core loop: ${secs.toFixed(1)}s (restored '${word}')`);
  expect(secs).toBeLessThan(180);
});
