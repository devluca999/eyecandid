"use client";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { DropZone, PillButton, StatusDot } from "@eyelore/ui";
import { getAnonId } from "@/lib/anon";
import { session } from "@/lib/session";
import { probeVideo, uploadFile } from "@/lib/upload";
import { useTrack } from "@/lib/track";

/** The landing's drop zone: no signup. Opens the editor at once and uploads in the background. */
export function Drop() {
  const router = useRouter();
  const create = useMutation(api.projects.create);
  const uploadUrl = useMutation(api.projects.uploadUrl);
  const addSource = useMutation(api.projects.addSource);
  const track = useTrack();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  const start = useCallback(
    async (file: File, source: "drop" | "picker") => {
      setError(null);
      const anonId = getAnonId();
      const droppedAt = Date.now();
      track("drop_started", { bytes: file.size, source });
      let meta: { w: number; h: number; durationMs: number };
      try {
        meta = await probeVideo(file);
      } catch (e) {
        setError(e instanceof Error ? e.message : "couldn't read that file");
        return;
      }
      const projectId = await create({ anonId, title: file.name.replace(/\.[^.]+$/, "").slice(0, 80) });
      session.put({ projectId, file, droppedAt });
      router.push(`/edit/${projectId}`);
      try {
        const storageId = await uploadFile(() => uploadUrl({ anonId, projectId }), file, (p) => session.update(projectId, { uploadProgress: p }));
        track("upload_done", { ms: Date.now() - droppedAt });
        await addSource({ anonId, projectId, storageId: storageId as Id<"_storage">, contentType: file.type || "video/mp4", source: "upload", ...meta });
        session.update(projectId, { uploadProgress: 1 });
      } catch {
        session.update(projectId, { error: "upload failed · check your connection and drop it again" });
      }
    },
    [addSource, create, router, track, uploadUrl],
  );

  return (
    <>
      <DropZone onDrop={(f) => void start(f, "drop")} />
      <input ref={input} type="file" accept="video/*" hidden data-testid="file-input" onChange={(e) => e.target.files?.[0] && void start(e.target.files[0], "picker")} />
      <div className="flex flex-col items-center gap-8">
        <PillButton icon="plus" onClick={() => input.current?.click()} testId="choose-clip">
          choose a clip
        </PillButton>
        <span className="text-meta text-ink-secondary">or drop your rawest clips anywhere</span>
        {error && <StatusDot status="attention" label={error} />}
      </div>
    </>
  );
}
