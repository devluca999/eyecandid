/** Public env, with honest stubs when a key is missing (see PLAN.md "Needs keys"). */
export const env = {
  convexUrl: process.env.NEXT_PUBLIC_CONVEX_URL ?? "",
  clerkKey: process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "",
  sentryDsn: process.env.NEXT_PUBLIC_SENTRY_DSN ?? "",
};
export const stubs = {
  auth: !env.clerkKey,
  errors: !env.sentryDsn,
};
