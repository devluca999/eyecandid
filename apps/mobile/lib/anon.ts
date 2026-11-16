import * as SecureStore from "expo-secure-store";
import * as Crypto from "expo-crypto";

const KEY = "eyelore.anonId";
/** Anonymous session id (ADR 0006), kept in the keychain. */
export async function getAnonId(): Promise<string> {
  const existing = await SecureStore.getItemAsync(KEY);
  if (existing && /^anon_[0-9a-f]{32}$/.test(existing)) return existing;
  const bytes = Crypto.getRandomBytes(16);
  const id = "anon_" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  await SecureStore.setItemAsync(KEY, id);
  return id;
}
