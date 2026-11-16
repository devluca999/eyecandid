# 0004 · The job contract is defined once in zod and emitted as JSON Schema

**Status:** accepted · 2026-11-15

**Decision.** `packages/core/src/jobs.ts` defines every job type's input and output with zod and a contract `version`. A build step emits `packages/core/schema/jobs.schema.json`. Convex validates on enqueue and complete; the Python worker validates with `jsonschema` against the same file, and CI runs a contract test on both sides. Breaking changes bump the job type's `version`; workers advertise the versions they support when claiming.

**Consequences.** No hand-maintained Python mirror of the types. The schema file is committed so CI fails on drift.
