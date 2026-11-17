import * as Sentry from "@sentry/nextjs";
import { initSentry } from "./lib/sentry";

// No DSN, no Sentry: init is skipped entirely, so nothing is captured or sent (PLAN.md "Needs keys").
initSentry(Sentry.init, process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN, process.env.VERCEL_ENV ?? process.env.NODE_ENV);
