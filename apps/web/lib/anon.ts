"use client";
/** Anonymous session id (ADR 0006): long, random, client-held. Claimed into an account at signup. */
const KEY = "eyelore.anonId";
export function getAnonId(): string {
  let id: string | null = null;
  try {
    id = localStorage.getItem(KEY);
  } catch {
    // storage blocked (private mode): fall back to a per-load id
  }
  if (id && /^anon_[0-9a-f]{32}$/.test(id)) return id;
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  id = "anon_" + [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
  try {
    localStorage.setItem(KEY, id);
  } catch {
    // storage blocked (private mode): fall back to a per-load id
  }
  return id;
}
