import { expect, test, type Page } from "@playwright/test";

test("landing: the hero line, the real drop well and the sections, in order", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText(/Making real people look great\.|Drop your rawest clips\./);
  await expect(page.getByTestId("choose-clip")).toBeVisible();
  await expect(page.getByTestId("file-input")).toHaveCount(1); // one uploader for every "drop a clip" on the page
  const h2 = await page.getByRole("heading", { level: 2 }).allInnerTexts();
  expect(h2).toEqual([
    "Same people. Same phones. Better takes.",
    "Point at a clip. Pick the move.",
    "Same words. Different movie.",
    "Every track drives itself.",
    "Phone or prompt. Same polish.",
    "Cheaper than a reshoot.",
    "Fair questions.",
    "Go film the awkward one.",
  ]);
  // footage is self-hosted, never hotlinked
  const srcs = await page.locator("video, video source").evaluateAll((els) => els.map((e) => e.getAttribute("src") ?? e.getAttribute("poster") ?? ""));
  expect(srcs.filter((s) => /mixkit/.test(s))).toEqual([]);
  // no prices, no emoji (design rule)
  const text = await page.locator("body").innerText();
  expect(text).not.toMatch(/\$\s?\d/);
  expect(text.replace(/[©®™]/g, "")).not.toMatch(/\p{Extended_Pictographic}/u);
  await expect(page.getByRole("link", { name: "footage credits" })).toHaveAttribute("href", "/credits");
});

test("landing: placeholders are labelled in previews (production hides them: lib/visibility.test.ts)", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByTestId("founder-placeholder")).toContainText("[founder letter: Luca to write]");
  await expect(page.getByTestId("founder-placeholder")).toContainText("HIDDEN IN PRODUCTION");
  await expect(page.getByTestId("proof-placeholder")).toContainText("PLACEHOLDER");
});

test("landing: with reduced motion the clips stay posters and nothing pins", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/");
  await page.waitForLoadState("load");
  const hero = page.locator('.ec-hero video[data-clip="32800"]');
  await expect(hero).toHaveAttribute("poster", "/media/32800.jpg");
  await page.waitForTimeout(2500); // past the point where videos would have been attached
  expect(await page.locator("video source").count()).toBe(0);
  expect(await page.locator("video").evaluateAll((vs) => vs.filter((v) => !(v as HTMLVideoElement).paused).length)).toBe(0);
  const seq = page.locator(".ec-seq");
  await expect(seq).toHaveClass(/is-static/);
  // every step of the walkthrough is readable, the finished edit is shown
  await expect(seq.locator(".ec-step__b")).toHaveCount(7);
  await expect(seq.locator(".ec-step").last()).toHaveAttribute("aria-current", "step");
  // the inline-edits demo shows its finished still, and says it is not in the editor yet
  await expect(page.locator(".ec-inline__stage")).toHaveAttribute("data-step", "still");
  await expect(page.locator(".ec-inline")).toContainText("pro · coming soon");
});

test("landing: with motion, clips on screen get self-hosted sources and play", async ({ page }) => {
  await page.goto("/");
  const v = page.locator('.ec-hero video[data-clip="2300"]');
  await expect(v.locator("source")).toHaveCount(2, { timeout: 15_000 });
  await expect(v.locator("source").first()).toHaveAttribute("src", /^\/media\/2300-(480|720)\.webm$/);
});

test("landing: start now takes you to the drop well", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("start-now").click();
  await expect(page.getByTestId("choose-clip")).toBeFocused();
  await expect(page.getByTestId("choose-clip")).toBeInViewport();
});

test("landing: request access writes a request", async ({ page }, info) => {
  await page.goto("/");
  await page.getByTestId("request-access").click();
  const form = page.getByTestId("access-form");
  await form.getByLabel("email").fill(`e2e+${info.project.name}-${Date.now()}@example.com`);
  await form.getByLabel("what you make").fill("ugc for a candle shop");
  await form.getByLabel(/a link/).fill("example.com/me");
  await page.getByTestId("access-submit").click();
  await expect(page.getByTestId("access-sent")).toContainText("we’ll email you");
});

test("visual: landing hero", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" }); // posters, no parallax: a stable frame
  await page.goto("/");
  await page.evaluate(() => localStorage.setItem("eyelore.anonId", "anon_" + "0".repeat(32))); // pin the A/B arm
  await page.reload();
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  await page.waitForLoadState("networkidle");
  // every hero tile on screen has its poster (the desktop-only ones attach theirs after hydration)
  await expect
    .poll(() => page.locator(".ec-hero video").evaluateAll((vs) => vs.filter((v) => (v as HTMLElement).offsetParent && !v.getAttribute("poster")).length))
    .toBe(0);
  await page.waitForLoadState("networkidle");
  await expect(page).toHaveScreenshot("landing-hero.png", { mask: [page.locator(".ec-hero__recent")] });
});

/** The hero's boxes, to prove the pause slot moves nothing: the well, the slot, and the h1 above it. */
async function heroBoxes(page: Page) {
  const box = async (sel: string) => (await page.locator(sel).first().boundingBox())!;
  return { h1: await box("#hero-title"), well: await box(".ec-hero__well"), hero: await box(".ec-hero") };
}

test("landing: free is open, so the pause slot is empty and the hero keeps its box", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("eyelore.engine", "server"));
  await page.goto("/");
  const before = await heroBoxes(page);
  await expect(page.getByTestId("file-input")).toHaveAttribute("data-ready", "1");
  await expect(page.locator('input[data-testid="file-input-backend"]')).toBeAttached({ timeout: 30_000 }); // the lazy backend is in
  await page.waitForTimeout(1500); // let its queries answer
  await expect(page.locator(".ec-hero__pause")).toBeEmpty();
  expect((await page.locator(".ec-hero__pause").boundingBox())?.height ?? 0).toBe(0);
  expect(await heroBoxes(page)).toEqual(before);
});

// free_paused is global: CI runs this alone with the flag on (E2E_PAUSED=1), like the paused refusal in ux-crawl.spec.ts
test("landing: a paused free day is said by the drop well before any drop, without moving the hero @paused", async ({ page }, info) => {
  test.skip(process.env.E2E_PAUSED !== "1", "needs the free_paused flag on (CI runs this alone, then turns it off)");
  test.skip(info.project.name !== "desktop", "the flag is global: one project");
  await page.addInitScript(() => localStorage.setItem("eyelore.engine", "server")); // the pause only applies to server edits
  await page.goto("/");
  const before = await heroBoxes(page); // measured before the lazy backend (and so the line) exists
  const line = page.locator(".ec-hero__pause").getByText("free edits are paused for today · back tomorrow");
  await expect(line).toBeVisible({ timeout: 30_000 });
  const l = (await line.boundingBox())!;
  const well = (await page.getByTestId("choose-clip").boundingBox())!;
  expect(l.y).toBeGreaterThanOrEqual(well.y + well.height); // by the well, below it
  expect(l.y - (well.y + well.height)).toBeLessThan(60);
  expect(await heroBoxes(page)).toEqual(before); // nothing moved when it appeared
});
