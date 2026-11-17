/**
 * Cost per free edit for /funnel (MVP spec, Phase 3). Convex can't read the Modal bill, so this is an estimate:
 * worker seconds actually spent on server jobs × an hourly rate the owner copies from the provider's pricing page
 * (EYELORE_CPU_USD_PER_HOUR). Edits done on the visitor's device cost no compute and are counted separately.
 */
export type CostInput = {
  /** finished server jobs in the window: how long each ran on a worker */
  jobs: { startedAt?: number; finishedAt?: number }[];
  /** exports in the window, and whether each was rendered on the visitor's device */
  exports: { device: boolean }[];
  /** USD per worker hour; null when the rate isn't set */
  usdPerHour: number | null;
};

export type CostSummary = {
  workerSeconds: number;
  serverExports: number;
  deviceExports: number;
  /** null when the rate isn't set */
  workerUsd: number | null;
  /** worker spend ÷ server exports; null without a rate or without server exports */
  usdPerServerExport: number | null;
  /** worker spend ÷ all exports (device ones cost nothing); null without a rate or exports */
  usdPerExport: number | null;
};

export function costSummary({ jobs, exports, usdPerHour }: CostInput): CostSummary {
  let ms = 0;
  for (const j of jobs) if (j.startedAt != null && j.finishedAt != null && j.finishedAt > j.startedAt) ms += j.finishedAt - j.startedAt;
  const workerSeconds = ms / 1000;
  const deviceExports = exports.filter((e) => e.device).length;
  const serverExports = exports.length - deviceExports;
  const workerUsd = usdPerHour === null ? null : (workerSeconds / 3600) * usdPerHour;
  return {
    workerSeconds,
    serverExports,
    deviceExports,
    workerUsd,
    usdPerServerExport: workerUsd === null || serverExports === 0 ? null : workerUsd / serverExports,
    usdPerExport: workerUsd === null || exports.length === 0 ? null : workerUsd / exports.length,
  };
}

/** Reads the rate from the env value; anything that isn't a positive number means "not set". */
export function parseRate(raw: string | undefined): number | null {
  const n = Number(raw);
  return raw && Number.isFinite(n) && n > 0 ? n : null;
}
