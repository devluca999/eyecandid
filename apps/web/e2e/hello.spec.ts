import { expect, test } from "@playwright/test";

/** Phase 1 exit criterion: web → Convex queue → worker → live progress → result. Needs a worker (E2E_WORKER=1). */
test("hello job round-trips with live progress", async ({ page }) => {
  test.skip(!process.env.E2E_WORKER, "needs a running worker (set E2E_WORKER=1)");
  await page.goto("/hello");
  await expect(page.getByTestId("stage")).toContainText(/worker online/);
  await page.getByTestId("run-hello").click();
  await expect(page.getByTestId("stage")).toContainText(/step \d of 5/);
  await expect(page.getByTestId("result")).toContainText("hello from the web");
});
