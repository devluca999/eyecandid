/** Feature flags (ADR 0007). Stable bucketing so a subject always lands in the same arm. */
export const FLAGS = {
  hello_job: "Phase 1 round-trip demo",
  on_device: "free tier: transcribe and render on the visitor's device when it can (ADR 0012)",
  core_loop: "Phase 2 drop → cut → export",
  accounts: "Phase 2.4 Clerk signup at export + anonymous claim",
  billing: "Phase 2.4 paywall and Stripe checkout",
  ready_email: "Phase 2.4 your edit is ready email",
  /** Phase 4: approved Pro seats. Created enabled with rolloutPct 0; the allow list holds approved emails (lowercase). */
  pro: "Phase 4 Pro by request (allow list of approved emails)",
  hero_line_ab: "A/B test of the landing hero line",
  genre_switcher: "Phase 3",
  weave: "Phase 3",
  take_mixer: "Phase 3",
  select_and_talk: "Phase 3",
  /** budget switch: on = free server jobs are refused with an honest message (convex/lib/limits.ts) */
  free_paused: "pause free server jobs",
} as const;
export type FlagKey = keyof typeof FLAGS;

export interface FlagRow {
  key: string;
  enabled: boolean;
  rolloutPct: number; // 0..100
  allow: string[];
}

/** FNV-1a 32-bit, deterministic across JS runtimes (Convex, browser, Hermes). */
export function hash32(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

export function bucket(subject: string, key: string): number {
  return hash32(`${key}:${subject}`) % 100;
}

export function evaluateFlag(row: FlagRow | null | undefined, subject: string): boolean {
  if (!row || !row.enabled) return false;
  if (row.allow.includes(subject)) return true;
  return bucket(subject, row.key) < row.rolloutPct;
}

export const HERO_LINES = {
  a: "Making real people look great.",
  b: "Drop your rawest clips.",
} as const;
export function heroVariant(subject: string): keyof typeof HERO_LINES {
  return bucket(subject, "hero_line_ab") < 50 ? "a" : "b";
}
