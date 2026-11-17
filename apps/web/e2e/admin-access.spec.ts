import { expect, test } from "@playwright/test";

/**
 * Phase 4: a request from the landing shows up on /admin/access, approve takes a seat and records the email honestly.
 * CI sets EYELORE_ADMIN_TOKEN on its local Convex backend and passes the same value as E2E_ADMIN_TOKEN; SendPulse
 * and Stripe are not configured there, so the email reads "not sent · SendPulse not configured".
 */
const TOKEN = process.env.E2E_ADMIN_TOKEN;

test("admin access: request, approve, seats used, honest email outcome", async ({ page }, info) => {
  test.skip(!TOKEN, "needs E2E_ADMIN_TOKEN (CI sets EYELORE_ADMIN_TOKEN on its local backend)");
  const email = `e2e-admin+${info.project.name}-${Date.now()}@example.com`;

  await page.goto("/");
  await page.getByTestId("request-access").click();
  const form = page.getByTestId("access-form");
  await form.getByLabel("email").fill(email);
  await form.getByLabel("what you make").fill("ugc for a candle shop");
  await page.getByTestId("access-submit").click();
  await expect(page.getByTestId("access-sent")).toBeVisible();

  await page.goto("/admin/access");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
  await page.getByLabel("admin token").fill("not-the-token");
  await page.getByRole("button", { name: "open" }).click();
  await expect(page.getByText("token not accepted · try again")).toBeVisible();

  await page.getByLabel("admin token").fill(TOKEN!);
  await page.getByRole("button", { name: "open" }).click();
  await expect(page.getByTestId("seats")).toHaveText(/^seats used \d+ of 100$/);
  const row = page.locator(`[data-testid="access-row"][data-email="${email}"]`);
  await expect(row.getByTestId("access-status")).toHaveText("new");
  await expect(row).toContainText("ugc for a candle shop");
  expect(page.url()).not.toContain(TOKEN!);

  const before = Number((await page.getByTestId("seats").textContent())!.match(/used (\d+)/)![1]);
  await row.getByRole("button", { name: "approve" }).click();
  await expect(row.getByTestId("access-status")).toHaveText("approved");
  await expect(row.getByTestId("access-email")).toHaveText("not sent · SendPulse not configured");
  const after = Number((await page.getByTestId("seats").textContent())!.match(/used (\d+)/)![1]);
  expect(after).toBeGreaterThanOrEqual(before + 1);
});

test("admin access: decline needs no email", async ({ page }, info) => {
  test.skip(!TOKEN, "needs E2E_ADMIN_TOKEN (CI sets EYELORE_ADMIN_TOKEN on its local backend)");
  const email = `e2e-decline+${info.project.name}-${Date.now()}@example.com`;
  await page.goto("/");
  await page.getByTestId("request-access").click();
  await page.getByTestId("access-form").getByLabel("email").fill(email);
  await page.getByTestId("access-submit").click();
  await expect(page.getByTestId("access-sent")).toBeVisible();

  await page.goto(`/admin/access#${encodeURIComponent(TOKEN!)}`);
  const row = page.locator(`[data-testid="access-row"][data-email="${email}"]`);
  await row.getByRole("button", { name: "decline" }).click();
  await expect(row.getByTestId("access-status")).toHaveText("declined");
  await expect(row.getByTestId("access-email")).toHaveCount(0);
  expect(page.url()).not.toContain(TOKEN!);
});

test("pro checkout: a bad invite link says so", async ({ page }) => {
  await page.goto("/pro/checkout?token=eci_" + "0".repeat(64));
  await expect(page.getByTestId("pro-checkout")).toContainText("this link isn't valid any more");
  await expect(page.locator('meta[name="robots"]')).toHaveAttribute("content", /noindex/);
});
