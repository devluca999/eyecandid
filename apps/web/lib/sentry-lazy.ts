import type * as SentryNs from "@sentry/nextjs";
type Sentry = typeof SentryNs;
let sentry: Promise<Sentry | null> | null = null;

/**
 * Imports and initialises the Sentry browser SDK once (~50 KB gzip, so it is kept out of the first-paint bundle).
 * Resolves to null, without loading anything, when NEXT_PUBLIC_SENTRY_DSN is not set (PLAN.md "Needs keys").
 */
export function startSentry(): Promise<Sentry | null> {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn) return Promise.resolve(null);
  return (sentry ??= import("@sentry/nextjs").then((S) => {
    S.init({ dsn, tracesSampleRate: 0.1, environment: process.env.NEXT_PUBLIC_VERCEL_ENV });
    return S;
  }));
}
