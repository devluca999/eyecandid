import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

const TALK = fileURLToPath(new URL("../../../services/engine/tests/fixtures/talk.mp4", import.meta.url));

/**
 * A failed upload on the server path keeps the file in the tab, so the editor offers "try again" and re-sends it
 * (docs/ux/findings.md #12) instead of asking for a drop the editor can't take.
 */
test("a failed upload offers try again, and it re-sends the clip held in the tab", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one upload at a time");
  test.setTimeout(120_000);
  await page.addInitScript(() => localStorage.setItem("eyelore.engine", "server"));
  // the storage upload fails until the test lets it through (the clip is small: going offline after the drop would race it)
  let down = true;
  await page.route(/\/api\/storage\/upload/, (route) => (down ? route.abort("connectionfailed") : route.continue()));
  await page.goto("/");
  await expect(page.getByTestId("file-input")).toHaveAttribute("data-ready", "1");
  await page.getByTestId("file-input").setInputFiles(TALK);
  await expect(page).toHaveURL(/\/edit\//, { timeout: 45_000 });
  const retry = page.getByTestId("retry-upload");
  await expect(retry).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId("explain")).toContainText("upload failed · check your connection and try again");
  down = false;
  await retry.click();
  await expect(retry).toHaveCount(0);
  await expect(page.getByTestId("explain")).not.toContainText(/upload/, { timeout: 60_000 }); // sent: the edit moves on
});
