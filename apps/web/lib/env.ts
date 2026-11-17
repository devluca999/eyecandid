/** Public env, with honest stubs when a key is missing (see PLAN.md "Needs keys"). */
export const env = {
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL ?? "",
  clerkKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
  /** a hosted 20 s raw take for "try it with our clip" (MVP spec, Phase 2); the button hides when unset */
  sampleClipUrl: process.env.NEXT_PUBLIC_SAMPLE_CLIP_URL ?? "",
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
};
export const stubs = {
  auth: !env.clerkKey,
  errors: !env.sentryDsn,
};
