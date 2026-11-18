"use client";

/**
 * Can this visitor's clip be edited at all? The free tier edits on the visitor's device (ADR 0012) and falls back to a
 * server worker. A browser with no WebGPU/WebCodecs AND no reachable worker would be told "no engine is running"
 * only after the drop; the landing says it before instead (docs/ux/findings.md #7).
 */
export const NO_ENGINE_LINE = "this browser can't edit on your device yet · try chrome or edge on a computer";

export type Presence = { live: number; wake: "asked" | "none" | "failing" | null; wakeable: boolean };

/** A worker is polling, or a cold one can be woken and the last wake did not fail. */
export function serverReachable(p: Presence): boolean {
  return p.live > 0 || (p.wakeable && p.wake !== "failing");
}

function hook(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null; // storage blocked: no override
  }
}

/**
 * Test hooks, like "eyelore.engine" (server | device): "eyelore.engine" = "unsupported" pretends this browser cannot
 * edit on-device; "eyelore.worker" = "none" | "live" pretends no worker / a live worker, whatever the backend says.
 */
export function engineHooks() {
  const engine = hook("eyelore.engine");
  const worker = hook("eyelore.worker");
  const presence: Presence | null = worker === "none" ? { live: 0, wake: "none", wakeable: false } : worker === "live" ? { live: 1, wake: null, wakeable: false } : null;
  return { engine, forceUnsupported: engine === "unsupported", presence };
}
