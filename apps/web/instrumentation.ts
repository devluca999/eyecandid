import * as Sentry from "@sentry/nextjs";

/** Next.js loads this once per runtime. Each config is a no-op without a DSN. */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") await import("./sentry.server.config");
  if (process.env.NEXT_RUNTIME === "edge") await import("./sentry.edge.config");
}

export const onRequestError = Sentry.captureRequestError;
