// Measures how smoothly the landing's clips play, in a real Chrome window (real GPU, H.264). From apps/web:
//   node scripts/perf/landing-video.mjs [baseUrl] [variant,variant…]     (needs a production build running)
// Per viewport (desktop 1440×900, phone 390×844 with 4× CPU throttle) and per phase (idle, mouse sweep, scroll) it
// reports page frame pacing (rAF), per-clip frame pacing (when the compositor presented each frame, from
// requestVideoFrameCallback), how many clips play at once and play/pause churn. Chrome's dropped-frame counter is left
// out: this collector inflates it (about 1% at idle without it). Variants switch one suspect off with CSS to find a cause.
// CPU throttling does not slow video decode or the compositor, so the phone numbers are a lower bound.
import { chromium } from "@playwright/test";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

const base = process.argv[2] ?? "http://127.0.0.1:3000";
const VARIANTS = {
  base: "",
  nograin: ".ec-grain{display:none!important}",
  nofilter: ".ec-clip{filter:none!important}.ec-cine{display:none!important}",
  noblur: ".ec-t{filter:none!important}",
  ticker:
    "@keyframes t{to{transform:rotate(360deg)}}body::after{content:'';position:fixed;left:0;top:0;width:1px;height:1px;background:rgba(0,0,0,.02);animation:t 1s linear infinite;z-index:99;pointer-events:none}",
  noparallax: ".ec-t,[data-drift]{transform:none!important}",
};
const want = (process.argv[3] ?? "base").split(",");
const VIEWS = {
  desktop: { viewport: { width: 1440, height: 900 }, throttle: 1 },
  phone: {
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    throttle: 4,
  },
};

const collector = () => {
  const S = (window.__perf = { raf: [], vids: new Map(), ev: {}, phase: "load" });
  let last = 0;
  const tick = (t) => {
    if (last) S.raf.push([S.phase, t - last]);
    last = t;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
  for (const name of ["play", "pause", "waiting", "stalled", "seeking"])
    document.addEventListener(
      name,
      (e) => {
        const k = S.phase + ":" + name;
        S.ev[k] = (S.ev[k] ?? 0) + 1;
      },
      true,
    );
  const hook = (v) => {
    if (S.vids.has(v) || !v.requestVideoFrameCallback) return;
    const rec = { id: v.dataset.clip, d: [] };
    S.vids.set(v, rec);
    let prev = 0,
      prevT = 0,
      prevN = 0;
    const cb = (now, meta) => {
      // skip the gap across a pause or the loop seam's own media-time jump: only pacing while it plays
      // presentationTime is when the compositor showed the frame (the callback itself only runs with the main thread's frames)
      if (prev && !v.paused)
        rec.d.push([
          S.phase,
          meta.presentationTime - prev,
          meta.mediaTime < prevT ? 1 : 0,
          meta.presentedFrames - prevN,
        ]);
      prev = meta.presentationTime;
      prevN = meta.presentedFrames;
      prevT = meta.mediaTime;
      v.requestVideoFrameCallback(cb);
    };
    v.requestVideoFrameCallback(cb);
    v.addEventListener("pause", () => (prev = 0));
  };
  const scan = () => document.querySelectorAll("video").forEach(hook);
  new MutationObserver(scan).observe(document, { childList: true, subtree: true });
  document.addEventListener("DOMContentLoaded", scan);
  try {
    new PerformanceObserver((l) => l.getEntries().forEach((e) => (S.lcp = e.startTime))).observe({
      type: "largest-contentful-paint",
      buffered: true,
    });
    S.cls = 0;
    new PerformanceObserver((l) =>
      l.getEntries().forEach((e) => !e.hadRecentInput && (S.cls += e.value)),
    ).observe({ type: "layout-shift", buffered: true });
  } catch {}
};

const q = (a, p) =>
  a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : 0;
const r1 = (n) => Math.round(n * 10) / 10;

for (const [view, opt] of Object.entries(VIEWS)) {
  for (const variant of want) {
    const { throttle, ...ctxOpt } = opt;
    const ctx = await chromium.launchPersistentContext(mkdtempSync(join(tmpdir(), "ec-perf-")), {
      headless: false,
      channel: "chrome",
      ...ctxOpt,
    });
    const page = ctx.pages()[0] ?? (await ctx.newPage());
    await page.addInitScript(collector);
    const cdp = await ctx.newCDPSession(page);
    if (throttle > 1) await cdp.send("Emulation.setCPUThrottlingRate", { rate: throttle });
    await page.goto(base, { waitUntil: "load" });
    if (VARIANTS[variant]) await page.addStyleTag({ content: VARIANTS[variant] });
    await page.waitForTimeout(5000); // posters, idle callback, sources attach, first frames
    const phase = (p) => page.evaluate((p) => (window.__perf.phase = p), p);
    const playing = () =>
      page.evaluate(
        () => [...document.querySelectorAll("video")].filter((v) => !v.paused && v.readyState > 2).length,
      );

    await phase("idle");
    await page.waitForTimeout(6000);
    const playingIdle = await playing();
    if (view === "desktop") {
      await phase("mouse");
      for (let i = 0; i < 80; i++) {
        await page.mouse.move(720 + 500 * Math.cos(i / 8), 450 + 300 * Math.sin(i / 5));
        await page.waitForTimeout(50);
      }
    }
    await phase("scroll");
    const h = opt.viewport.height;
    for (let i = 0; i < 60; i++) {
      await page.mouse.wheel(0, (h * 2.5) / 60);
      await page.waitForTimeout(50);
    }
    const playingScrolled = await playing();
    for (let i = 0; i < 60; i++) {
      await page.mouse.wheel(0, (-h * 2.5) / 60);
      await page.waitForTimeout(50);
    }
    await phase("done");

    const out = await page.evaluate(() => {
      const S = window.__perf;
      return {
        raf: S.raf,
        ev: S.ev,
        lcp: S.lcp,
        cls: S.cls,
        vids: [...S.vids.entries()].map(([v, r]) => ({
          id: r.id,
          d: r.d,
          src: v.currentSrc.split("/").pop(),
          w: v.clientWidth,
        })),
      };
    });
    console.log(
      `\n== ${view} · ${variant} · lcp ${Math.round(out.lcp ?? 0)} ms · cls ${(out.cls ?? 0).toFixed(3)} · playing idle ${playingIdle}, scrolled ${playingScrolled}`,
    );
    const hz =
      1000 /
      q(
        out.raf.map((x) => x[1]),
        0.5,
      );
    for (const ph of ["idle", "mouse", "scroll"]) {
      const raf = out.raf.filter((x) => x[0] === ph).map((x) => x[1]);
      if (!raf.length) continue;
      const frame = 1000 / hz;
      // only consecutive frames (a callback can skip frames when the main thread runs slower than the compositor)
      const vd = out.vids.flatMap((v) =>
        v.d.filter((x) => x[0] === ph && !x[2] && x[3] === 1).map((x) => x[1]),
      );
      const seam = out.vids.flatMap((v) => v.d.filter((x) => x[0] === ph && x[2]).map((x) => x[1]));
      // a clip frame is "late" when it arrives more than one display frame after its 41.7 ms slot would allow
      const late = vd.filter((d) => d > 41.7 + frame * 1.5).length;
      const held = vd.filter((d) => d > 58).length; // a frame left up for 4+ display frames at 60 Hz: the visible stutter
      const steps = vd.map((d) => Math.round(d / frame));
      const hist = {};
      for (const k of steps) hist[k] = (hist[k] ?? 0) + 1;
      console.log(
        `${ph.padEnd(6)} page frames ${raf.length} · p50 ${r1(q(raf, 0.5))} p95 ${r1(q(raf, 0.95))} p99 ${r1(q(raf, 0.99))} max ${r1(Math.max(...raf))} ms · long(>1.5×) ${raf.filter((d) => d > frame * 1.5).length}` +
          ` | clip frames ${vd.length} · p50 ${r1(q(vd, 0.5))} p95 ${r1(q(vd, 0.95))} p99 ${r1(q(vd, 0.99))} max ${r1(vd.length ? Math.max(...vd) : 0)} ms · held ≥58 ms ${r1((100 * held) / (vd.length || 1))}% · late ${late} (${r1((100 * late) / (vd.length || 1))}%) | loop seams ${seam.length} · p50 ${r1(q(seam, 0.5))} max ${r1(seam.length ? Math.max(...seam) : 0)} ms | holds in display frames ${JSON.stringify(hist)}`,
      );
    }
    console.log(`display ~${Math.round(hz)} Hz · events ${JSON.stringify(out.ev)}`);
    console.log(
      "clips: " +
        out.vids
          .filter((v) => v.src)
          .map((v) => `${v.src}@${v.w}px`)
          .join(" "),
    );
    await ctx.close();
  }
}
