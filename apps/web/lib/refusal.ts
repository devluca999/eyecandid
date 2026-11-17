/**
 * The one-line refusal a Convex mutation threw on purpose (a ConvexError carrying a string: free caps, the daily
 * pause, rate limits, access-request limits). Anything else (network, server fault) gets the caller's fallback,
 * because Convex hides unexpected error text in production and we must not invent it.
 */
export function refusalMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "data" in e) {
    const data = (e as { data: unknown }).data;
    if (typeof data === "string" && data.trim()) return data;
  }
  return fallback;
}
