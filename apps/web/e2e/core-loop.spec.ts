import { expect, test, type Page } from "@playwright/test";
import { fileURLToPath } from "node:url";
import { unnamedControls } from "./a11y";

const CLIP = fileURLToPath(new URL("../../../services/engine/tests/fixtures/talk.mp4", import.meta.url));

/**
 * Phase 2 exit criterion (web): landing → exported, captioned, reframed video in under 3 minutes of the user's time.
 * Needs a real CPU worker (transcribe + autocut + reframe + render) polling the same backend: E2E_REAL_WORKER=1.
 */
test("drop a raw clip → polished, captioned 9:16 export in under 3 minutes", async ({ page }, info) => {
  test.skip(!process.env.E2E_REAL_WORKER, "needs a real cpu worker (E2E_REAL_WORKER=1)");
  test.skip(info.project.name !== "desktop", "one pipeline at a time on the single CI worker");
  test.setTimeout(300_000);
  const t0 = Date.now();

  await page.addInitScript(() => localStorage.setItem("eyelore.engine", "server")); // these specs prove the worker path
  await page.goto("/");
  await expect(page.getByTestId("file-input")).toHaveAttribute("data-ready", "1"); // hydrated: the input's handler is live
  await page.getByTestId("file-input").setInputFiles(CLIP);
  await expect(page).toHaveURL(/\/edit\//);

  // the edit appears: beads with fillers struck through (not deleted)
  await expect(page.getByTestId("thread")).toBeVisible({ timeout: 120_000 });
  // no tour on the first edit: nothing sits over the first preview (mvp-spec, "The first minute")
  await expect(page.getByTestId("tour")).toHaveCount(0);
  await shot(page, "edit-ready");
  expect(await unnamedControls(page)).toEqual([]); // the ready editor: every control has a name
  const struck = page.getByTestId("struck-word");
  await expect(struck.first()).toBeVisible();
  const before = await struck.count();
  await expect(page.getByTestId("explain")).toContainText(/trimmed/);

  // restore one: the reason is recorded, and it's no longer struck
  const word = (await struck.first().innerText()).trim();
  await struck.first().click();
  await expect(page.getByTestId("struck-word")).toHaveCount(before - 1);
  await page.getByTestId("thread").hover({ position: { x: 2, y: 2 } });

  // export 9:16 (watermarked, anonymous) and get a file
  await page.getByRole("radio", { name: "9:16" }).click();
  await page.getByTestId("export").click();
  const download = page.getByTestId("download");
  await expect(download).toBeVisible({ timeout: 170_000 - (Date.now() - t0) });
  const href = await download.getAttribute("href");
  expect(href).toMatch(/^https?:\/\//);
  const res = await page.request.get(href!);
  expect(res.ok()).toBe(true);
  expect((await res.body()).byteLength).toBeGreaterThan(20_000);
  // clicking it saves a named file and the editor stays (a plain cross-origin link would replace the page)
  const [file] = await Promise.all([page.waitForEvent("download"), download.click()]);
  expect(file.suggestedFilename()).toBe("talk - eyecandid.mp4");
  await expect(page).toHaveURL(/\/edit\//);
  // the free export's one next step: Pro, offered once, never pushed
  await expect(page.getByTestId("pro-offer")).toContainText("request pro access");
  await expect(page.getByTestId("pro-offer")).toContainText("no watermark, clips up to 5 min?");
  // quiet dismiss; and once is once: a reload does not bring it back
  await page.getByTestId("pro-offer-dismiss").click();
  await expect(page.getByTestId("pro-offer")).toHaveCount(0);
  await page.reload();
  await expect(page.getByTestId("download")).toBeVisible({ timeout: 60_000 });
  await page.waitForTimeout(1500);
  await expect(page.getByTestId("pro-offer")).toHaveCount(0);

  const secs = (Date.now() - t0) / 1000;
  console.log(`core loop: ${secs.toFixed(1)}s (restored '${word}')`);
  expect(secs).toBeLessThan(180);

  // ---- the rest of the editor, on the same project (one pipeline on the single CI worker) ----
  await editorFeatures(page);
});

async function editorFeatures(page: Page) {
  const stage = page.getByTestId("stage");
  const duration = async () => Number(await stage.getAttribute("data-duration-ms"));
  await page.getByTestId("thread").hover({ position: { x: 2, y: 2 } });
  await shot(page, "edit");

  await wipeChecks(page);

  // "?" opens the shortcut sheet; escape closes it
  await page.keyboard.press("?");
  await expect(page.getByTestId("shortcuts")).toBeVisible();
  await expect(page.getByTestId("shortcuts")).toContainText("⌥T");
  await shot(page, "shortcuts");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("shortcuts")).toHaveCount(0);

  // the tour is taken from the sheet, stepped with the arrow keys, and Escape skips it
  await page.getByTestId("help").click();
  await page.getByRole("button", { name: "take the tour" }).click();
  const tour = page.getByTestId("tour");
  await expect(tour).toContainText("1 / 4");
  for (const n of [2, 3, 4]) {
    await page.locator("body").press("ArrowRight");
    await expect(tour).toContainText(`${n} / 4`);
    await shot(page, `tour-${n}`);
  }
  await page.locator("body").press("Escape");
  await expect(tour).toHaveCount(0);

  // the timeline drawer: closed by default, ⌥T or the handle opens it, five tracks in the product's order
  const timeline = page.getByTestId("timeline");
  await expect(timeline).not.toHaveClass(/is-open/);
  await page.keyboard.press("Alt+t");
  await expect(timeline).toHaveClass(/is-open/);
  await expect(timeline.getByTestId("track-name")).toHaveText(["video", "b-roll", "voice", "music", "captions"]);
  await expect(timeline.locator('[data-track="broll"]')).toContainText("no b-roll yet");
  await expect(timeline.locator('[data-track="voice"] .eyl-word').first()).toBeAttached();
  await shot(page, "timeline");
  await page.keyboard.press("Escape");
  await expect(timeline).not.toHaveClass(/is-open/);
  await page.getByTestId("timeline-handle").click();
  await expect(timeline).toHaveClass(/is-open/);
  await page.keyboard.press("Escape");

  // the pace dial re-edits the cut live; turning it back restores the cut exactly
  const before = await duration();
  const pace = page.getByRole("slider", { name: "pace" });
  await pace.focus();
  await expect(page.getByTestId("dials")).toBeVisible();
  // the fixture's pauses are ~0.2, 0.3–0.4 and 1.3s: autocut (pace 0.5) cut the 1.3s one; fast cuts the 0.3–0.4s ones
  for (let i = 0; i < 10; i++) await pace.press("ArrowUp"); // 0.5 → 1
  await expect.poll(duration, { timeout: 15_000 }).toBeLessThan(before);
  await expect(page.getByTestId("explain")).toContainText("pace ·");
  await shot(page, "dials");
  await expect(page.getByTestId("dials").getByRole("status")).toHaveAccessibleName("live", { timeout: 15_000 });
  for (let i = 0; i < 10; i++) await pace.press("ArrowDown"); // back to 0.5
  await expect.poll(duration, { timeout: 15_000 }).toBe(before);
  await expect(page.getByTestId("dials").getByRole("status")).toHaveAccessibleName("live", { timeout: 15_000 });

  // b-roll: no clips to weave yet, and the dial says so rather than pretending
  const broll = page.getByRole("slider", { name: "b-roll" });
  await expect(broll).toHaveAttribute("aria-valuetext", "no b-roll yet · add clips to weave");
  await broll.focus();
  await expect(page.getByTestId("explain")).toHaveText("no b-roll yet · add clips to weave");

  // energy: punch-ins on the hook, visible in the preview (same scale the export applies)
  await page.getByTestId("thread").getByRole("button", { name: /hook/ }).click(); // jump into the hook bead
  const footage = page.getByTestId("footage");
  await expect(footage).toHaveAttribute("data-punch", "1.00");
  const energy = page.getByRole("slider", { name: "energy" });
  await energy.focus();
  await energy.press("End");
  await expect(footage).toHaveAttribute("data-punch", "1.12");
  await expect(page.getByTestId("explain")).toContainText("punch-in");
  await shot(page, "energy");
  await expect(page.getByTestId("dials").getByRole("status")).toHaveAccessibleName("live", { timeout: 15_000 });
  await energy.press("Home");
  for (let i = 0; i < 10; i++) await energy.press("ArrowUp"); // 0 → 0.5: as shot
  await expect(footage).toHaveAttribute("data-punch", "1.00");
  await expect(page.getByTestId("dials").getByRole("status")).toHaveAccessibleName("live", { timeout: 15_000 });
  await page.locator("body").press("Escape"); // drop the bead selection

  // views: theater (Night, circle Lens), board (one card per bead), back to edit
  await page.locator("body").press("1");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await expect(page.getByTestId("lens-wrap").locator(".el-lens--circle")).toBeVisible();
  await expect(page.getByTestId("thread")).toHaveCount(0);
  await page.waitForTimeout(600); // let the morph settle for the screenshot
  await shot(page, "theater");
  await page.locator("body").press("3");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "paper");
  const cards = page.getByTestId("board-card");
  await expect(cards.first()).toBeVisible();
  const beads = await page.evaluate(() => document.querySelectorAll('[data-testid="board-card"]').length);
  expect(beads).toBeGreaterThan(0);
  await page.waitForTimeout(600);
  await shot(page, "board");
  // keep / cut from the card, and back
  const first = cards.first().getByTestId("board-toggle");
  const was = (await first.innerText()).trim();
  await first.click();
  await expect(first).toHaveText(was === "cut" ? "keep" : "cut");
  await shot(page, "board-struck");
  await first.click();
  await expect(first).toHaveText(was);
  await page.getByTestId("mode-edit").click();
  await expect(page.getByTestId("thread")).toBeVisible();
  await expect(page.getByTestId("lens-wrap").locator(".el-lens--circle")).toHaveCount(0);
  // night theme by hand, for the record
  await page.getByTestId("theme").click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "night");
  await shot(page, "edit-night");
  if (process.env.SHOTS) {
    await page.keyboard.press("Alt+t");
    await shot(page, "timeline-night");
    await page.keyboard.press("Escape");
    await page.getByRole("slider", { name: "pace" }).focus();
    await shot(page, "dials-night");
    await page.locator("body").press("?");
    await shot(page, "shortcuts-night");
    await page.locator("body").press("Escape");
  }
  await page.getByTestId("theme").click();
}

/** Screenshots for a human look (SHOTS=dir); never baselines — the footage is live. */
async function shot(page: Page, name: string) {
  if (!process.env.SHOTS) return;
  await page.waitForTimeout(700); // morphs and theme transitions settle
  await page.screenshot({ path: `${process.env.SHOTS}/${name}.png` });
}

/** The before/after wipe: a slider over the Lens; raw take on its left, the edit on its right, both playing in sync. */
async function wipeChecks(page: Page) {
  const handle = page.getByTestId("wipe-handle");
  await expect(handle).toHaveAccessibleName("before and after");
  await expect(handle).toHaveAttribute("role", "slider");
  await expect(handle).toHaveAttribute("data-wipe", "0.00"); // the edit first; the raw take is one drag away
  await handle.focus();
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("ArrowRight");
  await expect(handle).toHaveAttribute("data-wipe", "0.25");
  await expect(handle).toHaveAttribute("aria-valuenow", "25");
  await page.keyboard.press("ArrowLeft");
  await expect(handle).toHaveAttribute("data-wipe", "0.20");
  await page.keyboard.press("End");
  await page.keyboard.press("Home");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await page.keyboard.press("Shift+ArrowRight");
  await expect(handle).toHaveAttribute("data-wipe", "0.45");
  // both sides render, and the raw side is its own muted video of the same take
  const edit = page.getByTestId("footage");
  const raw = page.getByTestId("wipe-raw-video");
  await expect(edit).toBeVisible();
  await expect(raw).toBeVisible();
  await expect(raw).toHaveJSProperty("muted", true);
  await expect.poll(() => raw.evaluate((v: HTMLVideoElement) => v.readyState), { timeout: 20_000 }).toBeGreaterThanOrEqual(2);
  // a drag moves it (touch and mouse both go through pointer events)
  const lens = (await page.getByTestId("lens").boundingBox())!;
  const hb = (await handle.boundingBox())!;
  await page.mouse.move(hb.x + hb.width / 2, hb.y + hb.height / 2);
  await page.mouse.down();
  await page.mouse.move(lens.x + lens.width * 0.75, lens.y + lens.height / 2, { steps: 6 });
  await page.mouse.up();
  const x = Number(await handle.getAttribute("data-wipe"));
  expect(x).toBeGreaterThan(0.7);
  expect(x).toBeLessThan(0.8);
  await page.screenshot({ path: "test-results/wipe.png" }).catch(() => {});
  // the full raw take is still one control away
  await page.getByTestId("before-after").getByRole("radio", { name: "raw take" }).click();
  await expect(handle).toHaveCount(0);
  await page.getByTestId("before-after").getByRole("radio", { name: "edit" }).click();
  await expect(handle).toBeVisible();
  await handle.focus();
  await page.keyboard.press("Home");
}
