// Clerk ↔ Convex (ADR 0006).
// STUB until Clerk keys exist: no providers, so the app runs anonymous-only. Referencing an env var here would make
// every fresh deployment (including per-PR previews) fail to push until it was set. To enable Clerk:
//   providers: [{ domain: process.env.CLERK_JWT_ISSUER_DOMAIN!, applicationID: "convex" }]
// and set CLERK_JWT_ISSUER_DOMAIN on dev, prod and as a project default for previews.
export default {
  providers: [] as { domain: string; applicationID: string }[],
};
