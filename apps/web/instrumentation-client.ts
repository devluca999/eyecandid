import * as Sentry from "@sentry/nextjs";

// Browser init. Without NEXT_PUBLIC_SENTRY_DSN this does nothing (the SDK is never initialised).
const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
if (dsn) {
  Sentry.init({ dsn, tracesSampleRate: 0.1, environment: process.env.NEXT_PUBLIC_VERCEL_ENV });
}

export const onRouterTransitionStart = Sentry.captureRouterTransitionStart;
