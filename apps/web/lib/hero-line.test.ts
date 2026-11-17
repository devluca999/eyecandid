import { describe, expect, it } from "vitest";
import { heroVariant } from "@eyelore/core/flags";
import { HERO_LINE_SCRIPT } from "./hero-line";

function run(stored: string | null) {
  const store = new Map<string, string>(stored ? [["eyelore.anonId", stored]] : []);
  const attrs: Record<string, string> = {};
  const localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v) };
  const document = { documentElement: { setAttribute: (k: string, v: string) => void (attrs[k] = v) } };
  new Function("localStorage", "document", "crypto", HERO_LINE_SCRIPT)(localStorage, document, globalThis.crypto);
  return { variant: attrs["data-hero"], id: store.get("eyelore.anonId")! };
}

describe("the pre-paint hero line script", () => {
  it("buckets a stored anon id exactly like heroVariant()", () => {
    const seen = new Set<string>();
    for (let i = 0; i < 64; i++) {
      const id = "anon_" + i.toString(16).padStart(32, "0");
      const { variant } = run(id);
      expect(variant).toBe(heroVariant(id));
      seen.add(variant!);
    }
    expect(seen).toEqual(new Set(["a", "b"]));
  });
  it("creates a valid anon id on a first visit, and agrees with heroVariant() on it", () => {
    const { variant, id } = run(null);
    expect(id).toMatch(/^anon_[0-9a-f]{32}$/);
    expect(variant).toBe(heroVariant(id));
  });
});
