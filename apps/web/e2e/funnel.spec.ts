import { expect, test } from "@playwright/test";

/**
 * CI's local Convex has EYELORE_ADMIN_TOKEN set (passed to the tests as E2E_ADMIN_TOKEN): a wrong token is refused,
 * the right one opens the dashboard. Without it (a backend with no admin token) any token gets the honest
 * "not configured" line.
 */
const TOKEN = process.env.E2E_ADMIN_TOKEN;

test("funnel refuses a wrong token and opens with the right one", async ({ page }) => {
  test.skip(!TOKEN, "needs E2E_ADMIN_TOKEN");
  await page.goto("/funnel");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.getByLabel("admin token").fill("not-the-token");
  await page.getByRole("button", { name: "open" }).click();
  await expect(page.getByText("token not accepted · try again")).toBeVisible();
  await page.getByLabel("admin token").fill(TOKEN!);
  await page.getByRole("button", { name: "open" }).click();
  await expect(page.getByRole("heading", { name: /steps · last 7 days/ })).toBeVisible();
  expect(page.url()).not.toContain(TOKEN!);
});

test("funnel says it is not configured when the deployment has no admin token", async ({ page }) => {
  test.skip(!!TOKEN, "this backend has an admin token");
  await page.goto("/funnel");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.getByLabel("admin token").fill("any-token-in-ci");
  await page.getByRole("button", { name: "open" }).click();
  await expect(page.getByText("funnel dashboard not configured · set EYELORE_ADMIN_TOKEN on the Convex deployment")).toBeVisible();
  expect(page.url()).not.toContain("any-token-in-ci");
});
