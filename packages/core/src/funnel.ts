import { FUNNEL } from "./analytics";

/** The columns of an `events` row the funnel needs. `userId` is a plain string here (Convex ids are strings). */
export interface FunnelEventRow {
  anonHash?: string | null;
  userId?: string | null;
  props?: unknown;
}

export interface FunnelInput {
  /** Rows per event name, already limited to the window. Missing names count as empty. */
  rows: Partial<Record<string, FunnelEventRow[]>>;
  /** Names whose read hit the row bound (the newest rows were kept, so older ones in the window are missing). */
  truncated?: Partial<Record<string, boolean>>;
}

export interface FunnelStep {
  name: (typeof FUNNEL)[number];
  events: number;
  /** Distinct sessions: anonHash, falling back to userId. Rows with neither count as events only. */
  sessions: number;
  /** sessions / previous step's sessions; null for the first step or when the previous step is empty. */
  fromPrev: number | null;
  /** sessions / landing_view sessions; null when landing is empty. */
  fromLanding: number | null;
  truncated: boolean;
}

export interface FunnelSplitRow {
  key: string;
  landing: number;
  exported: number;
  /** exported / landing; null when landing is 0. */
  conversion: number | null;
}

export interface TimeToWow {
  samples: number;
  medianMs: number | null;
  p90Ms: number | null;
}

export interface FunnelSummary {
  steps: FunnelStep[];
  byPlatform: FunnelSplitRow[];
  byVariant: FunnelSplitRow[];
  timeToWow: TimeToWow;
}

/** The PLAN.md primary metric: drop_started to first_preview in at most 60 s. */
export const TIME_TO_WOW_TARGET_MS = 60_000;

const PLATFORMS = ["web", "ios", "android"] as const;

function sessionKey(r: FunnelEventRow): string | null {
  return r.anonHash || r.userId || null;
}

function prop(r: FunnelEventRow, key: string): unknown {
  const p = r.props;
  return p && typeof p === "object" ? (p as Record<string, unknown>)[key] : undefined;
}

function ratio(n: number, d: number): number | null {
  return d > 0 ? n / d : null;
}

/** Linear-interpolated percentile (p in 0..1) of an ascending-sorted array. */
export function percentile(sorted: number[], p: number): number | null {
  if (sorted.length === 0) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (idx - lo);
}

function splitBy(landing: FunnelEventRow[], exported: FunnelEventRow[], keyOf: (r: FunnelEventRow) => string): FunnelSplitRow[] {
  const l = new Map<string, Set<string>>();
  const e = new Map<string, Set<string>>();
  const add = (m: Map<string, Set<string>>, r: FunnelEventRow) => {
    const s = sessionKey(r);
    if (!s) return;
    const k = keyOf(r);
    if (!m.has(k)) m.set(k, new Set());
    m.get(k)!.add(s);
  };
  landing.forEach((r) => add(l, r));
  exported.forEach((r) => add(e, r));
  return [...new Set([...l.keys(), ...e.keys()])].map((key) => {
    const landingN = l.get(key)?.size ?? 0;
    const exportedN = e.get(key)?.size ?? 0;
    return { key, landing: landingN, exported: exportedN, conversion: ratio(exportedN, landingN) };
  });
}

/** Pure funnel aggregation. Conversion is a ratio of distinct-session counts, not a cohort join. */
export function aggregateFunnel({ rows, truncated = {} }: FunnelInput): FunnelSummary {
  const sessionSets = FUNNEL.map((name) => {
    const s = new Set<string>();
    for (const r of rows[name] ?? []) {
      const k = sessionKey(r);
      if (k) s.add(k);
    }
    return s;
  });
  const landingSessions = sessionSets[0]!.size;
  const steps: FunnelStep[] = FUNNEL.map((name, i) => ({
    name,
    events: (rows[name] ?? []).length,
    sessions: sessionSets[i]!.size,
    fromPrev: i === 0 ? null : ratio(sessionSets[i]!.size, sessionSets[i - 1]!.size),
    fromLanding: ratio(sessionSets[i]!.size, landingSessions),
    truncated: truncated[name] === true,
  }));

  const landing = rows["landing_view"] ?? [];
  const exported = rows["export_done"] ?? [];
  const platformOf = (r: FunnelEventRow) => {
    const p = prop(r, "platform");
    return typeof p === "string" && p ? p : "unknown";
  };
  const byPlatform = splitBy(landing, exported, platformOf).sort((a, b) => {
    const ai = PLATFORMS.indexOf(a.key as (typeof PLATFORMS)[number]);
    const bi = PLATFORMS.indexOf(b.key as (typeof PLATFORMS)[number]);
    return (ai < 0 ? 99 : ai) - (bi < 0 ? 99 : bi) || a.key.localeCompare(b.key);
  });
  const byVariant = splitBy(landing, exported, (r) => {
    const v = prop(r, "variant");
    return typeof v === "string" && v ? v : "none";
  }).sort((a, b) => a.key.localeCompare(b.key));

  const ms = (rows["first_preview"] ?? [])
    .map((r) => prop(r, "msSinceDrop"))
    .filter((x): x is number => typeof x === "number" && Number.isFinite(x) && x >= 0)
    .sort((a, b) => a - b);

  return {
    steps,
    byPlatform,
    byVariant,
    timeToWow: { samples: ms.length, medianMs: percentile(ms, 0.5), p90Ms: percentile(ms, 0.9) },
  };
}
