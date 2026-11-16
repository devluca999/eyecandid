# 0003 · The GPU job queue lives in Convex, with leases and pull-based workers

**Status:** accepted · 2026-11-15

**Context.** The legacy engine polls JSON files on a Google Drive mount every 15 s and rewrites paths per brand. It can't show live progress, retries by hand and can't run anywhere but Colab.

**Decision.** A `jobs` table in Convex. Workers call Convex HTTP actions (`claim`, `heartbeat`, `progress`, `complete`, `fail`, `upload-url`, `download-url`) with a per-worker bearer token, stored only as a SHA-256 hash. `claim` atomically leases the oldest queued job of a supported type for `leaseMs`; heartbeats extend it; a one-minute cron requeues expired leases until `maxAttempts`, then fails them. `enqueue` is idempotent on `idempotencyKey`. Workers make outbound calls only, so the same code runs on Colab, Modal, RunPod or a laptop.

**Consequences.** Live progress comes free from reactive queries. No inbound networking on GPU hosts. Throughput is bounded by Convex mutation rate, which is far above GPU throughput.
