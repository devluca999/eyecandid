import * as Sentry from "@sentry/nextjs";
import { initSentry } from "./lib/sentry";

// Same switch as the server config: nothing happens without a DSN.
initSentry(Sentry.init, process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN, process.env.VERCEL_ENV ?? process.env.NODE_ENV);
