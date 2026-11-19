import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

const TALK = fileURLToPath(new URL("../../../services/engine/tests/fixtures/talk.mp4", import.meta.url));

/**
 * The first-visit model download on the on-device engine (lib/resilient-fetch.ts). CI has no WebGPU, so these run the
 * CPU transcriber ("eyelore.engine" = "wasm", ADR 0016), which downloads through the same resilient fetch. The WebGPU
 * path is proven in a real Chrome by scripts/lab/download-stall.mjs.
 */
const MODEL = /huggingface\.co\/.*\.onnx|hf\.co\/.*/;

test("a model download that keeps failing ends in one plain line and try again, which finishes the SAME edit", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one model download at a time");
  test.setTimeout(300_000);
  await page.addInitScript(() => localStorage.setItem("eyelore.engine", "wasm"));
  let down = true;
  await page.context().route(MODEL, (route) => (down ? route.abort("connectionreset") : route.continue()));
  await page.goto("/");
  await expect(page.getByTestId("file-input")).toHaveAttribute("data-ready", "1");
  await page.getByTestId("file-input").setInputFiles(TALK);
  await expect(page).toHaveURL(/\/edit\//, { timeout: 45_000 });
  const url = page.url();
  // retried with backoff (1 + 3 + 8 s), said so, then given up with a reason in plain words
  await expect(page.getByTestId("explain")).toContainText(/retrying \(\d of 3\)/, { timeout: 60_000 });
  const retry = page.getByTestId("retry-device");
  await expect(retry).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("explain")).toContainText("the connection dropped while the editor downloaded · try again");
  await expect(page.getByTestId("explain")).not.toContainText(/cache|failed to execute|network error/i);
  down = false;
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect(page.getByTestId("thread")).toBeVisible({ timeout: 240_000 });
  expect(page.url()).toBe(url); // the same edit, not a new project
});

test("an on-device edit reopened before it was ready: a plain frame, never a stand-in figure, and choose it again", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one model download at a time");
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem("eyelore.engine", "wasm"));
  // keep it unfinished: the model never arrives in this test
  await page.context().route(MODEL, (route) => route.abort("connectionreset"));
  await page.goto("/");
  await expect(page.getByTestId("file-input")).toHaveAttribute("data-ready", "1");
  await page.getByTestId("file-input").setInputFiles(TALK);
  await expect(page).toHaveURL(/\/edit\//, { timeout: 45_000 });
  await page.reload();
  await expect(page.getByTestId("choose-again")).toBeVisible({ timeout: 30_000 });
  await expect(page.getByTestId("no-clip")).toBeVisible();
  await expect(page.getByTestId("footage")).toHaveCount(0);
  await expect(page.getByTestId("explain")).toContainText("your clip isn't in this one");
  // the same clip comes back into this tab and the same edit starts again
  await page.getByTestId("choose-again").locator('input[type="file"]').setInputFiles(TALK);
  await expect(page.getByTestId("footage")).toHaveCount(1);
  await expect(page.getByTestId("explain")).toContainText(/reading the sound|getting the editor ready|retrying/, { timeout: 30_000 });
});
