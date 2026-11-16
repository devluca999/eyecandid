"use client";
/**
 * The dropped file stays in this tab while it uploads, so the editor opens instantly on a local object URL —
 * the fastest possible "proxy" for the person who dropped it. Other devices use the uploaded source.
 */
type Pending = { projectId: string; file: File; url: string; droppedAt: number; uploadProgress: number; error?: string };
const pending = new Map<string, Pending>();
const listeners = new Set<() => void>();

export const session = {
  put(p: Omit<Pending, "uploadProgress" | "url">) {
    pending.set(p.projectId, { ...p, url: URL.createObjectURL(p.file), uploadProgress: 0 });
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
