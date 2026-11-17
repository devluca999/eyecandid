/**
 * Sentry for Convex, without an SDK: the default Convex runtime cannot run @sentry/node, so this posts one error
 * event to Sentry's envelope endpoint with fetch. It does nothing unless SENTRY_DSN is set on the deployment.
 * Only an error name, a message and tags go out; never clip content, emails or anonymous ids.
 */
export interface ParsedDsn {
  endpoint: string;
  publicKey: string;
}

/** Parse `https://<key>@<host>/<project>`; null when it isn't one (so a bad DSN is also a no-op). */
export function parseDsn(dsn: string | undefined): ParsedDsn | null {
  if (!dsn?.trim()) return null;
  try {
    const u = new URL(dsn.trim());
    const project = u.pathname.replace(/^\/+/, "");
    if (!u.username || !/^\d+$/.test(project)) return null;
    return { endpoint: `${u.protocol}//${u.host}/api/${project}/envelope/`, publicKey: u.username };
  } catch {
    return null;
  }
}

export function buildEnvelope(dsn: string, message: string, tags: Record<string, string>, env: string, now = Date.now()): string {
  const eventId = crypto.randomUUID().replace(/-/g, "");
  const event = {
    event_id: eventId,
    timestamp: now / 1000,
    platform: "javascript",
    level: "error",
    environment: env,
    logger: "convex",
    message: message.slice(0, 500),
    tags,
  };
  const header = { event_id: eventId, sent_at: new Date(now).toISOString(), dsn };
  return [JSON.stringify(header), JSON.stringify({ type: "event" }), JSON.stringify(event)].join("\n");
}

/** Report one error. Returns whether it was sent; never throws. */
export async function reportError(message: string, tags: Record<string, string> = {}, fetcher: typeof fetch = fetch): Promise<boolean> {
  const dsn = process.env.SENTRY_DSN;
  const parsed = parseDsn(dsn);
  if (!dsn || !parsed) return false;
  try {
    const res = await fetcher(parsed.endpoint, {
      method: "POST",
      headers: { "content-type": "application/x-sentry-envelope", "x-sentry-auth": `Sentry sentry_version=7, sentry_key=${parsed.publicKey}, sentry_client=eyelore-convex/1` },
      body: buildEnvelope(dsn, message, tags, process.env.EYELORE_ENV ?? "production"),
    });
    return res.ok;
  } catch {
    return false;
  }
}
