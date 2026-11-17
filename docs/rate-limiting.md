# Rate limiting and free caps

How abuse and cost are held down (mvp-spec "Low-cost architecture", Phase 3 and 5). Everything is enforced in Convex; the web only shows the message.

## Free caps (`convex/lib/limits.ts`, `projects.addSource`)

| rule | Free | Pro (any plan but free) |
|---|---|---|
| clip length | 60 s | 5 min |
| file size (from Convex `_storage` metadata, never the client) | 200 MB | 1 GB (sanity bound, not in the spec) |
| pipeline jobs in flight per anonymous session | 1 | no limit |
| daily budget | counts toward `EYELORE_FREE_DAILY_JOBS` (default 300 per UTC day) | not counted, never paused |

Refusals are `ConvexError` strings in the design voice; the web reads them with `refusalMessage` (`apps/web/lib/refusal.ts`).
Duration is the client's probe (a mutation cannot decode video), so it is a guard, not proof. A thrown refusal rolls back the mutation, so refused uploads' bytes stay in storage until an orphan sweep exists (not built).

## Daily budget pause

- Flag `free_paused` (the `flags` table; on = paused). Set with `npx convex run flags:set '{"key":"free_paused","enabled":true}'`.
- Cap: Convex env `EYELORE_FREE_DAILY_JOBS` (default 300), counted per UTC day in `dailyUsage`. Each free edit started (`addSource`) takes one slot.
- Paused or over the cap: new free edits and upload URLs are refused with "free edits are paused for today · back tomorrow". The flag alone also refuses free renders (so it stops spend at once); the cap only gates new edits, so an edit already started can finish.
- `api.limits.status({ anonId })` is the reactive query the web reads before upload; `FreeStatus` (`apps/web/app/free-status.tsx`) renders it. Place it next to the drop zone.

## Rate limits

Counted in `rateLimits` in fixed one-hour windows, per anonymous session (hash of the anon id) and per client hint:

| action | per session / hour | per client hint / hour |
|---|---|---|
| `projects.create` | 20 | 40 |
| `projects.uploadUrl` | 40 | 80 |
| `access.request` | 6 (plus the existing 3 a day) | 12 |

### The client hint

Convex mutations cannot see IPs. `GET /api/hint` (`apps/web/app/api/hint/route.ts`) reads `x-forwarded-for` (Vercel sets it, client first), computes `HMAC-SHA256(secret, ip)` and a signature, and returns only `<hash>.<sig>`. The client calls `getClientHint()` (`apps/web/lib/client-hint.ts`) and passes the result as the optional `clientHint` argument of `create`, `uploadUrl` and `access.request`. Convex verifies the signature with the same secret and rate-limits on the hash. The raw IP is never returned or stored.

Set `EYELORE_HINT_SECRET` (same random value) in Vercel and in Convex env. Without it, no hint is minted and limits are per session only.

Honest limits of this design: a caller who skips the hint, or rotates anonymous session ids, is only limited by what remains (the daily budget, the pause flag, Modal's spend cap). A signed hint cannot be forged, but it is optional. Making it mandatory needs the web call sites to send it (`drop.tsx` and the access form do not yet).

## Expiry (`convex/expiry.ts`)

A daily cron (03:17 UTC) deletes, through `MediaStore.delete`, raw uploads and proxies older than 7 days (Free) or 30 days (Pro) and render exports older than 30 days, and their media rows; edit docs stay. Each run handles one page of 100 and schedules the next page, then the next kind; the last step clears stale rate-limit counters. Media with no project (worker-registered proxies) is treated as Pro (30 days).
