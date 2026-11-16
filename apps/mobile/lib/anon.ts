import { useEffect, useState } from "react";
import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

const KEY = "eyelore.anonId";
let cached: string | null = null;

/** Anonymous session id (ADR 0006), kept in the keychain. */
export async function getAnonId(): Promise<string> {
  if (cached) return cached;
  const existing = await SecureStore.getItemAsync(KEY);
  if (existing && /^anon_[0-9a-f]{32}$/.test(existing)) return (cached = existing);
  const bytes = Crypto.getRandomBytes(16);
  const id = "anon_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  await SecureStore.setItemAsync(KEY, id);
  return (cached = id);
}

export function useAnonId(): string | null {
  const [id, setId] = useState<string | null>(cached);
  useEffect(() => {
    if (!id) void getAnonId().then(setId);
  }, [id]);
  return id;
}
