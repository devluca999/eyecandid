import { clientIpFrom, mintClientHint } from "@eyelore/core";

/**
 * Client hint for rate limiting (docs/rate-limiting.md). Convex mutations cannot see IPs, so this route reads the
 * client address Vercel puts in x-forwarded-for, turns it into a salted, signed hash, and returns only that.
 * The client passes it back as the `clientHint` argument of create / uploadUrl / access request, and Convex
 * verifies the signature with the same EYELORE_HINT_SECRET. The raw IP is never returned, logged or stored.
 * Without the secret this returns `{ hint: null }` and rate limiting falls back to per-session only.
 */
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const hint = await mintClientHint(clientIpFrom(req.headers), process.env.EYELORE_HINT_SECRET);
  return Response.json({ hint }, { headers: { "cache-control": "no-store" } });
}
