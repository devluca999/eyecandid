import { useSyncExternalStore } from "react";

/**
 * The clip stays on the phone while it uploads, so review opens at once on the local file — the fastest possible
 * proxy for the person who shot it. Other devices use the uploaded source.
 */
export type Pending = { projectId: string; uri: string; startedAt: number; uploadProgress: number; error?: string };
const pending = new Map<string, Pending>();
const listeners = new Set<() => void>();
const emit = () => listeners.forEach((l) => l());

export const session = {
  put(p: Omit<Pending, "uploadProgress">) {
    pending.set(p.projectId, { ...p, uploadProgress: 0 });
    emit();
  },
  update(projectId: string, patch: Partial<Pending>) {
    const p = pending.get(projectId);
    if (!p) return;
    pending.set(projectId, { ...p, ...patch });
    emit();
  },
};

export function usePending(projectId: string): Pending | undefined {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => pending.get(projectId),
  );
}
