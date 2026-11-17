"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { DropZone, Icon, StatusDot } from "@eyelore/ui";
import { getAnonId } from "@/lib/anon";
import { session } from "@/lib/session";
import { probeVideo, uploadFile } from "@/lib/upload";
import { useTrack } from "@/lib/track";

type Uploader = { pick: () => void; busy: boolean; error: string | null };
const Ctx = createContext<Uploader>({ pick: () => {}, busy: false, error: null });
export const useUploader = () => useContext(Ctx);

/**
 * The landing's one uploader: no signup. Owns the hidden file input and the full-window drop target; every
 * "drop a clip" on the page calls pick(). Opens the editor at once and uploads in the background.
 */
export function UploaderProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const create = useMutation(api.projects.create);
  const uploadUrl = useMutation(api.projects.uploadUrl);
  const addSource = useMutation(api.projects.addSource);
  const track = useTrack();
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const start = useCallback(
    async (file: File, source: "drop" | "picker") => {
      setError(null);
      setBusy(true);
      const anonId = getAnonId();
      const droppedAt = Date.now();
      track("drop_started", { bytes: file.size, source });
      let meta: { w: number; h: number; durationMs: number };
      try {
        meta = await probeVideo(file);
      } catch (e) {
        setBusy(false);
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
  const pick = useCallback(() => input.current?.click(), []);

  return (
    <Ctx.Provider value={{ pick, busy, error }}>
      {children}
      <DropZone onDrop={(f) => void start(f, "drop")} />
      <input
        ref={input}
        type="file"
        accept="video/*"
        hidden
        data-testid="file-input"
        onChange={(e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (f) void start(f, "picker");
        }}
      />
    </Ctx.Provider>
  );
}

/**
 * The drop well (design-system v2 DropZone, inline). Click or Enter opens the picker; a file dropped anywhere on the
 * window, including here, goes through the window drop target, so one drop is always one project.
 */
export function DropWell({ title, hint, height, testId, id }: { title: string; hint: string; height: number; testId?: string; id?: string }) {
  const { pick, busy, error } = useUploader();
  const [over, setOver] = useState(false);
  useEffect(() => {
    if (!over) return;
    const off = () => setOver(false);
    window.addEventListener("drop", off);
    window.addEventListener("dragend", off);
    return () => {
      window.removeEventListener("drop", off);
      window.removeEventListener("dragend", off);
    };
  }, [over]);
  return (
    <div className="ec-wellbox">
      <button
        type="button"
        id={id}
        className={"ec-well" + (over ? " is-over" : "") + (busy ? " is-busy" : "")}
        style={{ height }}
        onClick={pick}
        onDragEnter={() => setOver(true)}
        onDragLeave={() => setOver(false)}
        data-testid={testId}
        aria-describedby={id ? `${id}-hint` : undefined}
      >
        {busy && <span className="ec-well__sweep" aria-hidden />}
        <span className="ec-well__icon" aria-hidden>
          {busy ? <Icon name="sparkles" size={22} /> : <Icon name="arrow-up" size={22} style={{ transform: "rotate(180deg)" }} />}
        </span>
        <span className="ec-well__text">
          <span className="ec-well__title">{busy ? "reading your clip…" : over ? "let go" : title}</span>
          <span className="ec-well__hint" id={id ? `${id}-hint` : undefined}>
            {busy ? "finding the good parts · about a minute" : hint}
          </span>
        </span>
      </button>
      {error && <StatusDot status="attention" label={error} />}
    </div>
  );
}
