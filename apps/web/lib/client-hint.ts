"use client";
/**
 * The signed client hint from /api/hint, fetched once per page load and cached. Pass it as `clientHint` to
 * projects.create, projects.uploadUrl and access.request. Resolves to undefined when the route has no secret
 * or is unreachable: the server then rate-limits per session only.
 */
let cached: Promise<string | undefined> | null = null;

export function getClientHint(): Promise<string | undefined> {
  cached ??= fetch("/api/hint", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : null))
    .then((j: { hint?: string | null } | null) => j?.hint ?? undefined)
    .catch(() => undefined);
  return cached;
}
