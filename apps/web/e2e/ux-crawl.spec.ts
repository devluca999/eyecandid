import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { unnamedControls } from "./a11y";

/**
 * The UX crawl (docs/ux/flows.md): every route on desktop and phone, with no console errors, no broken links or
 * anchors, and an accessible name on every control; then the honest refusals a visitor can hit from the drop well.
 * Pins the server engine like the other specs (CI has no GPU). The paused-day check flips a global flag, so it runs
 * on its own in CI (E2E_PAUSED=1, after the main run); see .github/workflows/ci.yml.
 */

const LONG = fileURLToPath(new URL("./fixtures/long-65s.mp4", import.meta.url));
const TALK = fileURLToPath(new URL("../../../services/engine/tests/fixtures/talk.mp4", import.meta.url));

/** Every page a visitor (or the owner) can open, and a line that proves it rendered its real state. */
const ROUTES: { path: string; expect: RegExp; status?: number }[] = [
  { path: "/", expect: /Making real people look great\.|Drop your rawest clips\./ },
  { path: "/terms", expect: /Terms/ },
  { path: "/privacy", expect: /Privacy/ },
  { path: "/credits", expect: /Footage credits/ },
  { path: "/funnel", expect: /admin token/i },
  { path: "/admin/access", expect: /admin token/i },
  { path: "/pro/checkout", expect: /isn't valid any more/ },
  { path: "/pro/checkout?token=not-a-real-invite", expect: /isn't valid any more/ },
  { path: "/edit/not-an-edit", expect: /doesn't exist/ },
  { path: "/edit/k57b2c3d4e5f6g7h8j9k0m1n2p3q4r5s", expect: /doesn't exist/ },
  { path: "/no-such-page", expect: /nothing here/, status: 404 },
];

/** Vercel Web Analytics only exists on Vercel; `next start` answers its script with a 404. Nothing else may fail. */
const EXPECTED_MISSING = /\/_vercel\/insights\//;

function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(`pageerror: ${e.message.slice(0, 200)}`));
  page.on("console", (m) => {
    // a failed resource is reported by URL below, where the one expected miss can be told apart
    if (m.type() === "error" && !m.text().startsWith("Failed to load resource")) errors.push(`console: ${m.text().slice(0, 200)}`);
  });
  page.on("response", (r) => {
    if (r.status() >= 400 && !EXPECTED_MISSING.test(r.url()) && r.request().resourceType() !== "document") errors.push(`${r.status()} ${r.url()}`);
  });
  return errors;
}


for (const r of ROUTES) {
  test(`crawl ${r.path}: renders its state, no errors, named controls, links resolve`, async ({ page, request }) => {
    const errors = watchErrors(page);
    const res = await page.goto(r.path);
    expect(res?.status()).toBe(r.status ?? 200);
    await expect(page.locator("body")).toContainText(r.expect);
    await page.waitForLoadState("networkidle");
    // nothing runs off the side of the screen
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(1);
    expect(await unnamedControls(page)).toEqual([]);

    const hrefs = [...new Set(await page.locator("a[href]").evaluateAll((as) => as.map((a) => a.getAttribute("href")!)))];
    for (const href of hrefs) {
      if (/^(mailto|tel):/.test(href)) continue;
      if (href.startsWith("#")) {
        if (href.length > 1) expect(await page.locator(href).count(), `anchor ${href} on ${r.path}`).toBeGreaterThan(0);
        continue;
      }
      const url = new URL(href, page.url());
      if (url.origin !== new URL(page.url()).origin) continue; // the crawl never calls third parties
      const got = await request.get(url.toString());
      expect(got.status(), `${href} on ${r.path}`).toBeLessThan(400);
      if (url.hash.length > 1 && url.pathname === "/") {
        // a deep link into the landing (e.g. /#pricing from the editor) lands on a real section
        expect(await got.text(), `${href} on ${r.path}`).toContain(`id="${url.hash.slice(1)}"`);
      }
    }
    expect(errors).toEqual([]);
  });
}

test("crawl: the request-access form is labelled, and a bad address is refused in place", async ({ page }) => {
  await page.goto("/");
  await page.getByTestId("request-access").click();
  const form = page.getByTestId("access-form");
  await expect(form).toBeVisible();
  expect(await unnamedControls(page)).toEqual([]);
  await form.getByLabel("email").fill("not-an-email");
  await page.getByTestId("access-submit").click();
  // the browser holds it: nothing was sent, the form is still there to fix
  await expect(page.getByTestId("access-sent")).toHaveCount(0);
  expect(await form.getByLabel("email").evaluate((i) => (i as HTMLInputElement).validity.valid)).toBe(false);
});

async function landingReady(page: Page) {
  await page.addInitScript(() => localStorage.setItem("eyelore.engine", "server"));
  await page.goto("/");
  await expect(page.getByTestId("file-input")).toHaveAttribute("data-ready", "1");
}

test("refusal: a file that isn't a video says so on the landing, and no edit starts", async ({ page }) => {
  await landingReady(page);
  await page.getByTestId("file-input").setInputFiles({ name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("not a video") });
  await expect(page.getByText("that file doesn't look like a video").first()).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("refusal: an empty file says so on the landing", async ({ page }) => {
  await landingReady(page);
  await page.getByTestId("file-input").setInputFiles({ name: "empty.mp4", mimeType: "video/mp4", buffer: Buffer.alloc(0) });
  await expect(page.getByText("that file doesn't look like a video").first()).toBeVisible();
  await expect(page).toHaveURL(/\/$/);
});

test("refusal: a clip over the free 60 s cap gets the one-line reason", async ({ page }) => {
  await landingReady(page);
  await page.getByTestId("file-input").setInputFiles(LONG);
  await expect(page.getByText("free clips are up to 60 s · trim it or request pro").first()).toBeVisible({ timeout: 45_000 });
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByTestId("recent")).toHaveCount(0); // nothing half-made is left behind in "your edits"
  // the whole line is on screen, phones included (it wraps; it isn't cut off)
  const line = page.locator(".ec-hero .el-status").first();
  const box = (await line.boundingBox())!;
  expect(box.x).toBeGreaterThanOrEqual(0);
  expect(box.x + box.width).toBeLessThanOrEqual(page.viewportSize()!.width);
});
// the editor's controls are checked for names where its pipelines already run: core-loop (ready), delete (working)

test("refusal: a paused free day is said before any upload @paused", async ({ page }, info) => {
  test.skip(process.env.E2E_PAUSED !== "1", "needs the free_paused flag on (CI runs this alone, then turns it off)");
  test.skip(info.project.name !== "desktop", "the flag is global: one project");
  // the pause only applies to server edits; a browser without WebGPU can now edit on-device on the CPU (ADR 0016)
  await page.addInitScript(() => localStorage.setItem("eyelore.engine", "server"));
  await landingReady(page);
  await page.getByTestId("file-input").setInputFiles(TALK);
  await expect(page.getByText("free edits are paused for today · back tomorrow").first()).toBeVisible({ timeout: 30_000 });
});
