import type { NextConfig } from "next";
import { withSentryConfig } from "@sentry/nextjs/config";

const config: NextConfig = {
  transpilePackages: ["@eyelore/core", "@eyelore/ui"],
  reactStrictMode: true,
  poweredByHeader: false,
};

// Source maps are uploaded to Sentry only when SENTRY_AUTH_TOKEN exists, so a build without keys never touches
// Sentry's build plugin (and never fails on it). Runtime capture is separate: it needs only the DSN.
export default process.env.SENTRY_AUTH_TOKEN
  ? withSentryConfig(config, {
      org: process.env.SENTRY_ORG,
      project: process.env.SENTRY_PROJECT,
      authToken: process.env.SENTRY_AUTH_TOKEN,
      silent: !process.env.CI,
      telemetry: false,
    })
  : config;
