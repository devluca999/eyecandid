/**
 * Placeholder content (the founder letter, the proof strip) is shown on preview deployments and locally, and never
 * in production. Vercel sets VERCEL_ENV to "production" | "preview" | "development"; unset means a local build.
 * Read it in a server component so hidden content never reaches the browser.
 */
export function showPlaceholders(vercelEnv: string | undefined = process.env.VERCEL_ENV): boolean {
  return vercelEnv !== "production";
}
