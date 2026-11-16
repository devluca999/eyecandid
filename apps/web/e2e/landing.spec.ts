import { expect, test } from "@playwright/test";

test("landing shows the lockup, a hero line and the Lens", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Making real people look great\.|Drop your rawest clips\./);
  await expect(page.getByRole("img", { name: "a creator talking to camera" })).toBeVisible();
  // design rule: no emoji anywhere
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/\p{Extended_Pictographic}/u);
});

test("visual: landing", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("eyelore.anonId", "anon_" + "0".repeat(32))); // pin the A/B arm
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(page).toHaveScreenshot("landing.png", { mask: [page.locator(".el-scene")] });
});
