import { expect, test } from "@playwright/test";

/** Phase 1 exit criterion: web → Convex queue → worker → live progress → result. Needs a worker (E2E_WORKER=1). */
test("hello job round-trips with live progress", async ({ page }) => {
  test.skip(!process.env.E2E_WORKER, "needs a running worker (set E2E_WORKER=1)");
  // CI has one worker shared by every test running in parallel: the core-loop test can hold it for ~90s,
  // so this job may wait in the queue that long before it starts. Budget for that, not for an idle worker.
  test.setTimeout(240_000);
  await page.goto("/hello");
  await expect(page.getByTestId("stage")).toContainText(/worker online/);
  await page.getByTestId("run-hello").click();
  await expect(page.getByTestId("stage")).toContainText(/step \d of 5/, { timeout: 180_000 });
  await expect(page.getByTestId("result")).toContainText("hello from the web", { timeout: 60_000 });
});
