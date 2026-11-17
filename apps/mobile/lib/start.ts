import { useCallback } from "react";
import { useRouter } from "expo-router";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { getAnonId } from "./anon";
import { fileSize, uploadClip, type ClipMeta } from "./media";
import { session } from "./pending";
import { useTrack } from "./track";

export type NewClip = ClipMeta & { uri: string; source: "upload" | "camera"; title?: string; contentType?: string; script?: string[] };

/**
 * Start an edit from a clip on the phone: no signup. Review opens at once on the local file; the upload runs behind
 * it and the pipeline (transcribe → cut → reframe) starts the moment the source is registered.
 */
export function useStartProject() {
  const router = useRouter();
  const create = useMutation(api.projects.create);
  const uploadUrl = useMutation(api.projects.uploadUrl);
  const addSource = useMutation(api.projects.addSource);
  const track = useTrack();

  return useCallback(
    async (clip: NewClip) => {
      const anonId = await getAnonId();
      const startedAt = Date.now();
      track("drop_started", { bytes: await fileSize(clip.uri), source: clip.source === "camera" ? "camera" : "picker" });
      const projectId = await create({ anonId, title: clip.title, ...(clip.script?.length ? { script: clip.script } : {}) });
      session.put({ projectId, uri: clip.uri, startedAt });
      router.push({ pathname: "/edit/[id]", params: { id: projectId } });
      const contentType = clip.contentType ?? (clip.uri.toLowerCase().endsWith(".mov") ? "video/quicktime" : "video/mp4");
      try {
        const storageId = await uploadClip(() => uploadUrl({ anonId, projectId }), clip.uri, contentType, (p) => session.update(projectId, { uploadProgress: Math.min(p, 0.99) }));
        track("upload_done", { ms: Date.now() - startedAt });
        await addSource({ anonId, projectId, storageId: storageId as Id<"_storage">, contentType, source: clip.source, w: clip.w, h: clip.h, durationMs: clip.durationMs });
        session.update(projectId, { uploadProgress: 1 });
      } catch {
        session.update(projectId, { error: "upload failed · check your connection and try again" });
      }
    },
    [addSource, create, router, track, uploadUrl],
  );
}
