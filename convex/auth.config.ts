// Clerk <-> Convex (ADR 0006, 0009).
// Switches on by itself: with CLERK_JWT_ISSUER_DOMAIN set on the deployment, Clerk's "convex" JWT template is
// accepted; without it the provider list is empty and the app runs anonymous-only.
// Why `in`: reading `process.env.CLERK_JWT_ISSUER_DOMAIN` while it is unset makes `convex dev/deploy` fail the push
// ("used in auth config file but its value was not set"), which would break every fresh deployment, including
// per-PR previews. Checking presence first reads the variable only when it exists.
// Dashboard: Clerk > JWT templates > New > Convex (the template MUST be named "convex"); its issuer is the domain.
const domain = "CLERK_JWT_ISSUER_DOMAIN" in process.env ? process.env.CLERK_JWT_ISSUER_DOMAIN : undefined;

export default {
  providers: (domain ? [{ domain, applicationID: "convex" }] : []) as { domain: string; applicationID: string }[],
};
