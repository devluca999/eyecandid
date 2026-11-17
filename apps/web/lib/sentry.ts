/**
 * One switch for every Sentry runtime (browser, node, edge): nothing is initialised unless a DSN is set, so a build
 * or deploy without keys never captures, sends or loads anything. Source-map upload is separate (next.config.ts,
 * only with SENTRY_AUTH_TOKEN).
 */
export function initSentry(
  init: (opts: { dsn: string; tracesSampleRate: number; environment?: string }) => unknown,
  dsn: string | undefined,
  environment?: string,
): boolean {
  const d = dsn?.trim();
  if (!d) return false;
  init({ dsn: d, tracesSampleRate: 0.1, environment });
  return true;
}
