/**
 * Webhook signature verification with WebCrypto only (runs in the Convex runtime, no Node, no SDKs).
 * Both schemes: HMAC-SHA256 over a timestamped payload, a replay window, and a constant-time compare.
 */

export const TOLERANCE_S = 300;

const enc = new TextEncoder();

function b64decode(s: string): Uint8Array<ArrayBuffer> {
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}
function b64encode(b: ArrayBuffer): string {
  let s = "";
  for (const x of new Uint8Array(b)) s += String.fromCharCode(x);
  return btoa(s);
}
function hex(b: ArrayBuffer): string {
  return [...new Uint8Array(b)].map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function hmac(key: Uint8Array<ArrayBuffer>, data: string): Promise<ArrayBuffer> {
  const k = await crypto.subtle.importKey("raw", key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return await crypto.subtle.sign("HMAC", k, enc.encode(data));
}

/** Constant-time string compare (length is not secret: both sides are fixed-size digests). */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export type VerifyResult = { ok: true } | { ok: false; error: "missing headers" | "bad timestamp" | "stale timestamp" | "bad signature" | "bad secret" };

/**
 * Svix (used by Clerk). Headers: svix-id, svix-timestamp, svix-signature ("v1,<b64> v1,<b64>").
 * Signed content: `${id}.${timestamp}.${body}`; key: base64 of the secret after the "whsec_" prefix.
 */
export async function verifySvix(secret: string, headers: Headers, rawBody: string, nowMs = Date.now()): Promise<VerifyResult> {
  const id = headers.get("svix-id");
  const ts = headers.get("svix-timestamp");
  const sigs = headers.get("svix-signature");
  if (!id || !ts || !sigs) return { ok: false, error: "missing headers" };
  const t = Number(ts);
  if (!Number.isFinite(t)) return { ok: false, error: "bad timestamp" };
  if (Math.abs(nowMs / 1000 - t) > TOLERANCE_S) return { ok: false, error: "stale timestamp" };
  let key: Uint8Array<ArrayBuffer>;
  try {
    key = b64decode(secret.replace(/^whsec_/, ""));
  } catch {
    return { ok: false, error: "bad secret" };
  }
  const expected = b64encode(await hmac(key, `${id}.${ts}.${rawBody}`));
  for (const part of sigs.split(" ")) {
    const [version, sig] = part.split(",");
    if (version === "v1" && sig && timingSafeEqual(sig, expected)) return { ok: true };
  }
  return { ok: false, error: "bad signature" };
}

/**
 * Stripe. Header: `Stripe-Signature: t=<unix>,v1=<hex>[,v1=<hex>...]`.
 * Signed content: `${t}.${rawBody}`; key: the endpoint secret used as UTF-8 bytes.
 */
export async function verifyStripe(secret: string, header: string | null, rawBody: string, nowMs = Date.now()): Promise<VerifyResult> {
  if (!header) return { ok: false, error: "missing headers" };
  let t = "";
  const v1: string[] = [];
  for (const part of header.split(",")) {
    const i = part.indexOf("=");
    if (i < 0) continue;
    const k = part.slice(0, i).trim();
    const val = part.slice(i + 1).trim();
    if (k === "t") t = val;
    else if (k === "v1") v1.push(val);
  }
  if (!t || !v1.length) return { ok: false, error: "missing headers" };
  const ts = Number(t);
  if (!Number.isFinite(ts)) return { ok: false, error: "bad timestamp" };
  if (Math.abs(nowMs / 1000 - ts) > TOLERANCE_S) return { ok: false, error: "stale timestamp" };
  const expected = hex(await hmac(enc.encode(secret) as Uint8Array<ArrayBuffer>, `${t}.${rawBody}`));
  return v1.some((s) => timingSafeEqual(s, expected)) ? { ok: true } : { ok: false, error: "bad signature" };
}

/** Test helpers: produce valid headers for a body (kept here so the vectors match the verifier exactly). */
export async function signSvix(secret: string, id: string, ts: number, body: string): Promise<string> {
  return "v1," + b64encode(await hmac(b64decode(secret.replace(/^whsec_/, "")), `${id}.${ts}.${body}`));
}
export async function signStripe(secret: string, ts: number, body: string): Promise<string> {
  return `t=${ts},v1=${hex(await hmac(enc.encode(secret) as Uint8Array<ArrayBuffer>, `${ts}.${body}`))}`;
}
