// Clerk ↔ Convex (ADR 0006). Without CLERK_JWT_ISSUER_DOMAIN the app runs anonymous-only (labelled stub).
const domain = process.env.CLERK_JWT_ISSUER_DOMAIN;

export default {
  providers: domain ? [{ domain, applicationID: "convex" }] : [],
};
