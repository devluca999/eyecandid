import { expect, test } from "@playwright/test";

/** CI's Convex has no EYELORE_ADMIN_TOKEN, so any token must get the honest "not configured" line. */
test("funnel says it is not configured when the deployment has no admin token", async ({ page }) => {
  await page.goto("/funnel");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.getByLabel("admin token").fill("any-token-in-ci");
  await page.getByRole("button", { name: "open" }).click();
  await expect(page.getByText("funnel dashboard not configured · set EYELORE_ADMIN_TOKEN on the Convex deployment")).toBeVisible();
  expect(page.url()).not.toContain("any-token-in-ci");
});
