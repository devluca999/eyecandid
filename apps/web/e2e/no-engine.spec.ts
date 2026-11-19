import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";

/**
 * The landing's honest line (docs/ux/findings.md #7): a browser that can't edit on the device, with no worker up or
 * wakeable, is told so before the drop and a drop is refused with the same line. Nothing is created.
 *
 * CI's local Convex has a real CPU worker polling, so the backend's own answer would differ between jobs. These tests
 * pin both sides with the same kind of hook the other specs use for "eyelore.engine":
 *   "eyelore.engine" = "unsupported"  this browser can't edit on-device
 *   "eyelore.worker" = "none" | "live"  no worker reachable / a worker is up, whatever the backend says
 */
const TALK = fileURLToPath(new URL("../../../services/engine/tests/fixtures/talk.mp4", import.meta.url));
const LINE = "this browser can't edit on your device yet · try chrome or edge on a computer";

async function open(page: Page, hooks: Record<string, string>) {
  await page.addInitScript((h) => Object.entries(h).forEach(([k, v]) => localStorage.setItem(k, v)), hooks);
  await page.goto("/");
  await expect(page.getByTestId("file-input")).toHaveAttribute("data-ready", "1");
}

test("no device engine and no worker: the line shows beside the well, the picker stays shut", async ({ page }) => {
  await open(page, { "eyelore.engine": "unsupported", "eyelore.worker": "none" });
  const line = page.locator(".ec-hero .ec-wellbox .el-status");
  // shows once the backend has loaded (it loads on first touch or when idle)
  await page.locator("#drop").hover();
  await expect(line).toHaveText(LINE, { timeout: 30_000 });
  const box = (await line.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width); // wraps; never cut off
  let chooser = false;
  page.on("filechooser", () => (chooser = true));
  await page.locator("#drop").click();
  await page.waitForTimeout(500);
  expect(chooser).toBe(false);
  await expect(page).toHaveURL(/\/$/);
});

test("no device engine and no worker: a drop that lands before the backend loads waits for the check, then is refused", async ({ page }) => {
  await open(page, { "eyelore.engine": "unsupported", "eyelore.worker": "none" });
  // straight away: the backend hasn't loaded, so this file is queued, not started
  await page.getByTestId("file-input").setInputFiles(TALK);
  await expect(page.locator(".ec-hero .ec-wellbox .el-status")).toHaveText(LINE, { timeout: 30_000 });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("recent")).toHaveCount(0); // no project was made, nothing was uploaded
});

test("no device engine but a worker is up: the drop goes to the server as before", async ({ page }) => {
  await open(page, { "eyelore.engine": "unsupported", "eyelore.worker": "live" });
  await page.getByTestId("file-input").setInputFiles(TALK);
  await expect(page).toHaveURL(/\/edit\//, { timeout: 45_000 });
});

test("no device engine, the backend's own answer (CI has a real worker running)", async ({ page }) => {
  test.skip(!process.env.E2E_REAL_WORKER, "needs a real cpu worker polling (E2E_REAL_WORKER=1)");
  await open(page, { "eyelore.engine": "unsupported" });
  await page.getByTestId("file-input").setInputFiles(TALK);
  await expect(page).toHaveURL(/\/edit\//, { timeout: 45_000 });
});
