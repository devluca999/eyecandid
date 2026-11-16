# 0007 · Feature flags in Convex

**Status:** accepted · 2026-11-15

**Decision.** A `flags` table `{ key, enabled, rolloutPct, allow[] }`, read reactively by a `flags.forSubject` query. Rollout buckets hash the user or anon id so assignment is stable. The A/B hero line uses the same mechanism. Every new feature is wrapped in `useFlag("key")` on web and mobile and checked again server-side before it enqueues work.

**Consequences.** Flags flip live without a deploy. No extra vendor.
