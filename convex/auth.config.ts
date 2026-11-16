// Clerk <-> Convex (ADR 0006, 0009).
// Switches on by itself: with CLERK_JWT_ISSUER_DOMAIN set on the deployment, Clerk's "convex" JWT template is
// accepted; without it the provider list is empty and the app runs anonymous-only. The conditional matters:
// referencing the variable unconditionally (`process.env.X!`) makes every fresh deployment, including per-PR
// previews, fail to push until it is set.
// Dashboard: Clerk > JWT templates > New > Convex (the template MUST be named "convex"); its issuer is the domain.
const domain = process.env.CLERK_JWT_ISSUER_DOMAIN;

export default {
  providers: (domain ? [{ domain, applicationID: "convex" }] : []) as { domain: string; applicationID: string }[],
};
