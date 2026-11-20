# 0010 · Workers scale to zero and are woken on demand

**Status.** Accepted, 2026-11-17. Supersedes the "always-on CPU worker" part of the Phase 2 hosting decision.

**Context.** The core loop ran on two Modal containers (4 CPU, 8 GB; one per backend) kept warm around the clock by a 25-minute schedule. With almost no traffic that spent the workspace's monthly budget in hours and the schedule stopped: production sat at "the engine is cold" until someone noticed. The cost has to follow use.

**Decision.**
- Nothing runs while the queue is empty. `cpu_worker` drains the queue and exits after 180 idle seconds.
- When a job is enqueued and no worker has polled in the last 15 seconds, Convex calls the host's `wake` URL (`convex/wake.ts`, `EYELORE_WAKE_URL`), at most once per 45 seconds. `wake` starts a worker unless one is up. A cron repeats the check every minute for jobs still waiting (a lost call, a worker that left at the wrong moment, a requeued lease).
- Once an hour a worker starts anyway and leaves after the idle window.
- The worker stays pull-based and outbound-only: the wake call carries no job and no media, only "come and look". The job contract is untouched, and a worker that is simply left running (laptop, Colab) needs no wake URL.
- Auth without a new secret: Convex holds only the SHA-256 of the worker token and sends `sha256("wake:" + hash)`; the host derives the same value from its token.
- The editor says so honestly while it waits: "the engine is waking up · usually under a minute".

**Consequences.** Idle cost drops to about three worker-minutes an hour per backend. The first clip after a quiet spell pays a cold start (container start plus loading the transcription model), which hits time-to-wow exactly for the first-time visitor; measure it in production and, if it is too slow, keep one worker warm during waking hours only, or move transcription to a smaller always-warm function. A spend cap can still stop the engine: add a budget alert below the cap and a status line that says "the engine is unavailable" instead of waiting forever.

**Runner-ups.** Always-on with a smaller container (still pays 24/7, slower renders). Modal `min_containers` with a long-poll function (cannot go to zero). A queue push from Convex with the job in the request (breaks pull-only and the lease model).

**Amendment, 2026-11-19: spend guard.** Scale to zero was not enough on its own: nothing stopped a loop, a bad wake or a long idle window from spending the cap. Now: `cpu_worker` has `max_containers=1` (the GPU worker already did); the safety-net run is every 6 hours by default (`EYELORE_SAFETY_NET_HOURS`, 0 = off, read at deploy time so a change needs a redeploy) instead of hourly; and Convex keeps a daily estimate per pool (job seconds plus idle tails plus safety-net runs, at the rates in `EYELORE_CPU_USD_PER_HOUR` / `EYELORE_GPU_USD_PER_HOUR`) against `EYELORE_WORKER_DAILY_USD_CAP` (1.00) and `EYELORE_GPU_DAILY_USD_CAP` (2.00). At the cap that pool is not woken, free edits get the paused refusal, paid GPU requests are refused with no charge, and it resets at 00:00 UTC. The estimate cannot see container starts, so Modal's own workspace spend limit stays the backstop. Details and the idle-window cost table are in HANDOFF.md section 3b.
