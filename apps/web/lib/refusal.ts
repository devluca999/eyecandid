/**
 * The one-line refusal a Convex mutation threw on purpose (a ConvexError carrying a string: free caps, the daily
 * pause, rate limits, access-request limits). Anything else (network, server fault) gets the caller's fallback,
 * because Convex hides unexpected error text in production and we must not invent it.
 */
export function refusalMessage(e: unknown, fallback: string): string {
  if (e && typeof e === "object" && "data" in e) {
    const data = (e as { data: unknown }).data;
    if (typeof data === "string" && data.trim()) return data;
    // structured refusals ({ code, message }: the Pro gate and credits, convex/lib/entitle.ts) carry their own line
    const message = data && typeof data === "object" ? (data as { message?: unknown }).message : undefined;
    if (typeof message === "string" && message.trim()) return message;
  }
  return fallback;
}
