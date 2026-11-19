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
 * Test hooks, like "eyelore.engine" (server | device | wasm, wasm = on-device with the CPU transcriber even where
 * WebGPU exists): "eyelore.engine" = "unsupported" pretends this browser cannot edit on-device; "eyelore.worker" = "none" | "live" pretends no worker / a live worker, whatever the backend says.
 */
export function engineHooks() {
  const engine = hook("eyelore.engine");
  const worker = hook("eyelore.worker");
  const presence: Presence | null = worker === "none" ? { live: 0, wake: "none", wakeable: false } : worker === "live" ? { live: 1, wake: null, wakeable: false } : null;
  return { engine, forceUnsupported: engine === "unsupported", presence };
}

/**
 * Does this visitor's free edit run on their own device? Mirrors the choice in drop.tsx: "eyelore.engine" = server |
 * device | wasm forces it, else the `on_device` flag (on unless set false) and this browser's support decide. A server-side
 * free pause (flag or daily cap) only applies to the server path, so it matters only when this is false.
 * `null` while the flag or the support check has not answered yet: say nothing until it is known.
 */
export function editsOnDevice(o: { forced: string | null; onDeviceFlag: boolean | undefined; supported: boolean | null }): boolean | null {
  if (o.forced === "server") return false;
  if (o.forced === "device" || o.forced === "wasm") return true;
  if (o.forced === "unsupported") return false;
  if (o.onDeviceFlag === false) return false;
  return o.supported;
}
