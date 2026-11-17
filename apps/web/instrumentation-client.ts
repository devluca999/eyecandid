import * as Sentry from "@sentry/nextjs";
import { initSentry } from "./lib/sentry";

// Browser init. Without NEXT_PUBLIC_SENTRY_DSN this does nothing (the SDK is never initialised).
initSentry(Sentry.init, process.env.NEXT_PUBLIC_SENTRY_DSN, process.env.NEXT_PUBLIC_VERCEL_ENV);

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
