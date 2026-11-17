/**
 * Client hint: a salted, signed hash of the caller's IP, so Convex (which cannot see IPs) can rate-limit per client.
 * The Next.js route `/api/hint` mints it from x-forwarded-for; Convex verifies it. Both sides share one secret
 * (EYELORE_HINT_SECRET). The raw IP never leaves the route handler and is never stored.
 *
 * Format: `<32 hex hash>.<16 hex signature>`. Without the secret, no hint can be minted or verified.
 */
const enc = new TextEncoder();

async function hmacHex(secret: string, msg: string): Promise<string> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(msg));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Mint a hint for an IP, or null when there is no secret or no usable IP. */
export async function mintClientHint(ip: string | null | undefined, secret: string | undefined): Promise<string | null> {
  const clean = ip?.trim();
  if (!secret || !clean) return null;
  const hash = (await hmacHex(secret, `ip:${clean}`)).slice(0, 32);
  const sig = (await hmacHex(secret, `hint:${hash}`)).slice(0, 16);
  return `${hash}.${sig}`;
}

/** The hash part of a hint if its signature checks out; otherwise null (forged, malformed, or no secret). */
export async function verifyClientHint(hint: string | null | undefined, secret: string | undefined): Promise<string | null> {
  if (!secret || !hint) return null;
  const m = /^([0-9a-f]{32})\.([0-9a-f]{16})$/.exec(hint);
  if (!m) return null;
  const want = (await hmacHex(secret, `hint:${m[1]}`)).slice(0, 16);
  let diff = 0;
  for (let i = 0; i < 16; i++) diff |= want.charCodeAt(i) ^ m[2]!.charCodeAt(i);
  return diff === 0 ? m[1]! : null;
}

/** First address of an x-forwarded-for header (Vercel puts the client first and overwrites spoofed values). */
export function clientIpFrom(headers: { get(name: string): string | null }): string | null {
  const xff = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return xff || headers.get("x-real-ip")?.trim() || null;
}
