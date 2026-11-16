# 0006 · Anonymous first, Clerk at export

**Status:** accepted · 2026-11-15

**Decision.** A first visit creates a random `anonId` held by the client. Projects can be owned by `anonId`. Clerk signup is asked only at export; on signup a `claimAnonymous` mutation moves the anon session's projects to the user. Convex validates Clerk JWTs (`auth.config.ts`); anonymous calls carry `anonId` and are limited to their own projects and to free-tier jobs.

**Consequences.** Time-to-wow has no auth wall. The anon id is a capability token, so it is long and random and is never logged in events as anything but a hash.
