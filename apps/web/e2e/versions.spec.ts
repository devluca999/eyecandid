import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { unnamedControls } from "./a11y";

const CLIP = fileURLToPath(new URL("../../../services/engine/tests/fixtures/talk.mp4", import.meta.url));

/**
 * Three versions of the take (clean, punchy, genre): offered once the first edit is ready, picking one is one
 * explained change in the history, and undo puts the previous version back. Needs the real cpu worker, like the
 * core loop (E2E_REAL_WORKER=1), and runs on one project per viewport.
 */
test("pick punchy from three versions → the history says why → undo restores", async ({ page }, info) => {
  test.skip(!process.env.E2E_REAL_WORKER, "needs a real cpu worker (E2E_REAL_WORKER=1)");
  test.skip(info.project.name !== "desktop", "one pipeline at a time on the single CI worker");
  test.setTimeout(240_000);

  await page.addInitScript(() => {
    localStorage.setItem("eyelore.engine", "server"); // these specs prove the worker path
    localStorage.setItem("eyelore.tour.v1", "done");
  });
  await page.goto("/");
  await expect(page.getByTestId("file-input")).toHaveAttribute("data-ready", "1");
  await page.getByTestId("file-input").setInputFiles(CLIP);
  await expect(page).toHaveURL(/\/edit\//);

  // never before the first edit exists
  await expect(page.getByTestId("versions")).toHaveCount(0);
  await expect(page.getByTestId("thread")).toBeVisible({ timeout: 120_000 });
  const picker = page.getByTestId("versions");
  await expect(picker).toBeVisible();
  const tour = page.getByTestId("tour-skip");
  if (await tour.isVisible().catch(() => false)) await tour.click();

  // three cards, each with an accessible name that carries its one-line difference
  for (const id of ["clean", "punchy", "genre"]) await expect(page.getByTestId(`version-${id}`)).toBeVisible();
  await expect(page.getByTestId("version-punchy")).toHaveAccessibleName(/punchy: tighter pauses, push-ins, bold captions/);
  expect(await unnamedControls(page)).toEqual([]);
  await page.screenshot({ path: "test-results/versions-desktop.png" }).catch(() => {});

  // keyboard: focusing a card previews it without picking
  await page.getByTestId("version-punchy").focus();
  await expect(page.getByTestId("version-punchy")).toBeFocused();
  await expect(page.getByTestId("version-punchy")).toHaveAttribute("aria-pressed", "false");

  // pick punchy: it is now the current one, and the history says why
  await page.getByTestId("version-punchy").click();
  await expect(page.getByTestId("version-punchy")).toHaveAttribute("aria-pressed", "true", { timeout: 20_000 });
  await expect(page.getByTestId("version-punchy")).toHaveAccessibleName(/\(current\)$/);
  await expect(page.getByTestId("explain")).toContainText("picked punchy · tighter pauses, push-ins, bold captions");

  // undo (⌘Z) puts the previous version back
  await page.locator("body").click({ position: { x: 2, y: 2 } });
  await page.keyboard.press("ControlOrMeta+z");
  await expect(page.getByTestId("version-punchy")).toHaveAttribute("aria-pressed", "false", { timeout: 20_000 });
});
