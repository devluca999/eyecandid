"use client";
/**
 * The dropped file stays in this tab while it uploads, so the editor opens instantly on a local object URL —
 * the fastest possible "proxy" for the person who dropped it. Other devices use the uploaded source.
 */
type Pending = {
  projectId: string;
  file: File;
  url: string;
  droppedAt: number;
  uploadProgress: number;
  error?: string;
  /** "device": edited in this browser and never uploaded (ADR 0012) */
  engine?: "device" | "server";
  /** honest line from the on-device engine while it works */
  deviceStage?: string;
  /** the on-device run gave up (plain line). Shown at once, even while the server can't be told (offline) */
  deviceError?: string;
  /** the clip's probed size, kept so a failed upload can be sent again from the file held here */
  meta?: { w: number; h: number; durationMs: number };
};
const pending = new Map<string, Pending>();
const listeners = new Set<() => void>();

export const session = {
  put(p: Omit<Pending, "uploadProgress" | "url">) {
    pending.set(p.projectId, { ...p, url: URL.createObjectURL(p.file), uploadProgress: p.engine === "device" ? 1 : 0 });
    listeners.forEach((l) => l());
  },
  get(projectId: string) {
    return pending.get(projectId);
  },
  update(projectId: string, patch: Partial<Pending>) {
    const p = pending.get(projectId);
    if (!p) return;
    pending.set(projectId, { ...p, ...patch });
    listeners.forEach((l) => l());
  },
  subscribe(l: () => void) {
    listeners.add(l);
    return () => listeners.delete(l);
  },
};
