"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useConvex, useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { DropZone, Icon, StatusDot } from "@eyelore/ui";
import { getAnonId } from "@/lib/anon";
import { session } from "@/lib/session";
import { probeVideo, uploadFile } from "@/lib/upload";
import { useTrack } from "@/lib/track";
import { deviceSupport, faceTrackOnDevice, transcribeOnDevice } from "@/lib/device-engine";
import { env } from "@/lib/env";
import { getClientHint } from "@/lib/client-hint";
import { refusalMessage } from "@/lib/refusal";

type Uploader = { pick: () => void; trySample: (() => void) | null; busy: boolean; error: string | null };
const Ctx = createContext<Uploader>({ pick: () => {}, trySample: null, busy: false, error: null });
export const useUploader = () => useContext(Ctx);

/**
 * The landing's one uploader: no signup. Owns the hidden file input and the full-window drop target; every
 * "drop a clip" on the page calls pick(). Opens the editor at once and uploads in the background.
 */
export function UploaderProvider({ children }: { children: ReactNode }) {
  const router = useRouter();
  const convex = useConvex();
  const create = useMutation(api.projects.create);
  const uploadUrl = useMutation(api.projects.uploadUrl);
  const addSource = useMutation(api.projects.addSource);
  const addDeviceSource = useMutation(api.projects.addDeviceSource);
  const deviceProgress = useMutation(api.projects.deviceProgress);
  const applyDeviceTranscript = useMutation(api.projects.applyDeviceTranscript);
  const applyDeviceReframe = useMutation(api.projects.applyDeviceReframe);
  const deviceFailed = useMutation(api.projects.deviceFailed);
  const flags = useQuery(api.flags.forSubject, typeof window === "undefined" ? "skip" : { subject: getAnonId() });
  const track = useTrack();
  // check early so the first drop doesn't wait on it
  useEffect(() => {
    void deviceSupport();
  }, []);
  const input = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusyState] = useState(false);

  // one clip at a time: a second drop while the first is still being read would start a second edit
  const starting = useRef(false);
  const start = useCallback(
    async (file: File, source: "drop" | "picker" | "sample") => {
      if (starting.current) return;
      starting.current = true;
      // released once this clip is refused or its editor opens
      const setBusy = (b: boolean) => {
        if (!b) starting.current = false;
        setBusyState(b);
      };
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
      // free tier on the visitor's device when it can (ADR 0012): no upload, no worker, the clip stays here
      // tests pin the engine (localStorage "eyelore.engine" = "server" | "device"); everyone else gets the best this device can do
      let forced: string | null = null;
      try {
        forced = localStorage.getItem("eyelore.engine");
      } catch {
        // storage blocked: no override
      }
      const onDevice = forced === "server" ? false : forced === "device" ? true : flags?.on_device !== false && (await deviceSupport()).ok;
      // a clip we would refuse is refused here, before an edit exists or a byte is uploaded (the server checks again)
      const refused = await convex.query(api.projects.preflight, { anonId, durationMs: meta.durationMs, bytes: file.size, onDevice }).catch(() => null);
      if (refused) {
        setBusy(false);
        setError(refused);
        return;
      }
      let projectId: Id<"projects">;
      try {
        projectId = await create({ anonId, title: file.name.replace(/\.[^.]+$/, "").slice(0, 80), clientHint: await getClientHint() });
      } catch (e) {
        setBusy(false);
        setError(refusalMessage(e, "couldn't start an edit · check your connection and try again"));
        return;
      }
      if (onDevice) {
        let clipId: string;
        try {
          clipId = (await addDeviceSource({ anonId, projectId, contentType: file.type || "video/mp4", bytes: file.size, ...meta })).clipId;
        } catch (e) {
          setBusy(false);
          setError(refusalMessage(e, "couldn't start an edit · check your connection and try again"));
          return;
        }
        session.put({ projectId, file, droppedAt, engine: "device" });
        starting.current = false;
        router.push(`/edit/${projectId}`);
        let lastSent = 0;
        const onStage = (detail: string) => {
          session.update(projectId, { deviceStage: detail });
          if (Date.now() - lastSent > 2000) {
            lastSent = Date.now();
            void deviceProgress({ anonId, projectId, detail }).catch(() => {});
          }
        };
        try {
          const transcript = await transcribeOnDevice(file, meta.durationMs, onStage);
          if (transcript.words.length === 0) {
            await deviceFailed({ anonId, projectId, reason: "no speech found · try a clip where someone talks" });
          } else {
            session.update(projectId, { deviceStage: "trimming the ums" });
            await applyDeviceTranscript({ anonId, projectId, clipId, transcript });
            // the edit is ready; the face pass runs behind it (like the server's background reframe). Non-fatal:
            // on any failure the doc keeps its centred crop, and an export before it lands uses whatever the doc has.
            void faceTrackOnDevice(file, meta.durationMs)
              .then((r) => {
                console.info(`[reframe] ${r.faces}/${r.frames} frames with a face · ${r.keyframes.length} keyframes · ${r.ms} ms`);
                return applyDeviceReframe({ anonId, projectId, clipId, keyframes: r.keyframes, faces: r.faces });
              })
              .catch((e) => console.warn("[reframe] skipped, keeping the clip centred", e));
          }
        } catch (e) {
          const why = e instanceof Error ? e.message : String(e);
          await deviceFailed({ anonId, projectId, reason: `couldn't edit on this device · ${why}`.slice(0, 160) }).catch(() => {});
        } finally {
          session.update(projectId, { deviceStage: undefined });
        }
        return;
      }
      session.put({ projectId, file, droppedAt, engine: "server" });
      starting.current = false;
      router.push(`/edit/${projectId}`);
      try {
        const clientHint = await getClientHint();
        const storageId = await uploadFile(() => uploadUrl({ anonId, projectId, clientHint }), file, (p) => session.update(projectId, { uploadProgress: p }));
        track("upload_done", { ms: Date.now() - droppedAt });
        await addSource({ anonId, projectId, storageId: storageId as Id<"_storage">, contentType: file.type || "video/mp4", source: "upload", ...meta });
        session.update(projectId, { uploadProgress: 1 });
      } catch (e) {
        session.update(projectId, { error: refusalMessage(e, "upload failed · check your connection and drop it again") });
      }
    },
    [addDeviceSource, addSource, applyDeviceReframe, applyDeviceTranscript, convex, create, deviceFailed, deviceProgress, flags?.on_device, router, track, uploadUrl],
  );
  const pick = useCallback(() => input.current?.click(), []);
  // "try it with our clip": the hosted sample runs through the exact same pipeline as a dropped clip
  const trySample = useCallback(async () => {
    if (!env.sampleClipUrl) return;
    setError(null);
    setBusyState(true);
    try {
      const res = await fetch(env.sampleClipUrl);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      await start(new File([blob], "sample.mp4", { type: blob.type || "video/mp4" }), "sample");
    } catch {
      setBusyState(false);
      setError("couldn't load the sample · try your own clip");
    }
  }, [start]);
  // set once hydrated: the input's change handler exists from here on (tests wait for it before setInputFiles)
  const [ready, setReady] = useState(false);
  useEffect(() => setReady(true), []);

  return (
    <Ctx.Provider value={{ pick, trySample: env.sampleClipUrl ? () => void trySample() : null, busy, error }}>
      {children}
      <DropZone onDrop={(f) => void start(f, "drop")} />
      <input
        ref={input}
        type="file"
        accept="video/*"
        hidden
        data-testid="file-input"
        data-ready={ready ? "1" : undefined}
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
      {error && <StatusDot status="attention" label={error} style={{ whiteSpace: "normal", maxWidth: "100%" }} />}
    </div>
  );
}

/** Under the hero well: for people without a take. Hidden until a sample clip is configured. */
export function TrySample() {
  const { trySample, busy } = useUploader();
  if (!trySample) return null;
  return (
    <button type="button" className="el-pill el-pill--quiet el-pill--sm" onClick={trySample} disabled={busy} data-testid="try-sample">
      no take yet? try it with our clip
    </button>
  );
}
