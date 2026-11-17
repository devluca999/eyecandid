import type { captureRouterTransitionStart } from "@sentry/nextjs";
import { startSentry } from "./lib/sentry-lazy";

// Browser init. Without NEXT_PUBLIC_SENTRY_DSN this does nothing (the SDK is never loaded or initialised).
// On the landing ("/") the SDK starts a few seconds after load, when the browser is idle, so it stays out of the
// first paint; on every other route it starts right away.
if (process.env.NEXT_PUBLIC_SENTRY_DSN) {
  if (location.pathname === "/") {
    const go = () => void startSentry();
    const arm = () => setTimeout(() => (typeof requestIdleCallback === "function" ? requestIdleCallback(go, { timeout: 2000 }) : go()), 3000);
    if (document.readyState === "complete") arm();
    else addEventListener("load", arm, { once: true });
  } else {
    void startSentry();
  }
}

export const onRouterTransitionStart: typeof captureRouterTransitionStart = (...args) => {
  void startSentry().then((S) => S?.captureRouterTransitionStart(...args));
};
