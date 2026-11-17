import type * as SentryNs from "@sentry/nextjs";
import { initSentry } from "./sentry";
type Sentry = typeof SentryNs;
let sentry: Promise<Sentry | null> | null = null;

/**
 * Imports and initialises the Sentry browser SDK once (~50 KB gzip, so it is kept out of the first-paint bundle).
 * Resolves to null, without loading anything, when NEXT_PUBLIC_SENTRY_DSN is not set (PLAN.md "Needs keys").
 */
export function startSentry(): Promise<Sentry | null> {
  const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;
  if (!dsn?.trim()) return Promise.resolve(null);
  return (sentry ??= import("@sentry/nextjs").then((S) => (initSentry(S.init, dsn, process.env.NEXT_PUBLIC_VERCEL_ENV) ? S : null)));
}
