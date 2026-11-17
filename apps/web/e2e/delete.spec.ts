import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

const CLIP = fileURLToPath(new URL("../../../services/engine/tests/fixtures/talk.mp4", import.meta.url));

/** Someone drops a clip, thinks better of it, and removes it for good: found again from the landing, deleted in the editor. */
test("an edit can be found again from the landing and deleted for good", async ({ page }, info) => {
  test.skip(info.project.name !== "desktop", "one pipeline at a time on the single CI worker");
  await page.goto("/");
  await expect(page.getByTestId("recent")).toHaveCount(0);
  await page.getByTestId("file-input").setInputFiles(CLIP);
  await expect(page).toHaveURL(/\/edit\//);
  const editUrl = page.url();
  // the control arrives once the clip is safely registered, never under a live upload
  await expect(page.getByTestId("delete")).toBeVisible({ timeout: 45_000 });

  // back on the landing (a fresh load: nothing held in the tab), the edit is listed
  await page.goto("/");
  const recent = page.getByTestId("recent");
  await expect(recent.getByRole("link")).toHaveCount(1);
  await recent.getByRole("link").click();
  await expect(page).toHaveURL(editUrl);

  // one quiet verb, then an in-app step that says it is final; no browser dialog
  page.on("dialog", (d) => {
    // the hard navigation at the end can meet Convex's "unsaved changes" guard while a funnel event is still
    // in flight; that is not a delete confirmation. Any alert / confirm / prompt is.
    if (d.type() === "beforeunload") return void d.accept();
    throw new Error("no native dialogs");
  });
  await page.getByTestId("delete").click();
  await expect(page.getByTestId("delete-confirm")).toContainText("can't be undone");
  await info.attach("confirm", { body: await page.screenshot(), contentType: "image/png" });
  await page.getByTestId("delete-keep").click();
  await expect(page.getByTestId("delete-confirm")).toHaveCount(0);
  await expect(page.getByTestId("delete")).toBeVisible();

  await page.getByTestId("delete").click();
  await page.getByTestId("delete-yes").click();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("recent")).toHaveCount(0);

  // and it is gone for its owner too
  await page.goto(editUrl);
  await expect(page.getByText("doesn't exist")).toBeVisible();
});
