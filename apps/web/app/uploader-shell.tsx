"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState, type ComponentType, type ReactNode } from "react";
import { Icon, StatusDot } from "@eyelore/ui";
import { env } from "@/lib/env";

/**
 * The landing's light uploader shell. It owns what the first paint needs (the hidden file input, the pick() every
 * "drop a clip" calls, the drop well) and loads the real uploader (drop.tsx) plus Clerk and Convex from
 * landing-backend.tsx on first interaction, or when the browser is idle after load. A file picked or dropped before
 * the backend is there is queued and handed to the real uploader the moment it mounts, so nothing is lost.
 * Nothing here imports convex or clerk: that is the point.
 */

type Uploader = { pick: () => void; trySample: (() => void) | null; busy: boolean; error: string | null };
const Ctx = createContext<Uploader>({ pick: () => {}, trySample: null, busy: false, error: null });
export const useUploader = () => useContext(Ctx);

export type BackendProps = {
  /** Called once the real uploader is mounted; it hands over its file entry point and receives its state. */
  register: (forward: (file: File) => void) => void;
  report: (state: { busy: boolean; error: string | null }) => void;
};

const hasFiles = (e: DragEvent) => !!e.dataTransfer && [...e.dataTransfer.types].includes("Files");

export function LandingUploader({ children }: { children: ReactNode }) {
  const input = useRef<HTMLInputElement>(null);
  const [Backend, setBackend] = useState<ComponentType<BackendProps> | null>(null);
  const [queued, setQueued] = useState(false);
  const [real, setReal] = useState<{ busy: boolean; error: string | null }>({ busy: false, error: null });
  const [loadError, setLoadError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);
  const started = useRef(false);
  const forward = useRef<((f: File) => void) | null>(null);
  const pending = useRef<File | null>(null);

  const load = useCallback(() => {
    if (started.current) return;
    started.current = true;
    import("./landing-backend")
      .then((m) => setBackend(() => m.default))
      .catch(() => {
        started.current = false;
        pending.current = null;
        setQueued(false);
        setLoadError("couldn't load the uploader · check your connection and try again");
      });
  }, []);

  const enqueue = useCallback(
    (file: File) => {
      setLoadError(null);
      if (forward.current) return forward.current(file);
      pending.current = file;
      setQueued(true);
      load();
    },
    [load],
  );

  const register = useCallback((fn: (file: File) => void) => {
    forward.current = fn;
    const f = pending.current;
    pending.current = null;
    if (f) {
      fn(f);
      requestAnimationFrame(() => setQueued(false));
    }
  }, []);
  const report = useCallback((s: { busy: boolean; error: string | null }) => setReal(s), []);

  useEffect(() => {
    setReady(true);
    const opts = { capture: true, passive: true } as const;
    const events = ["pointerdown", "keydown", "focusin", "touchstart", "dragenter"] as const;
    for (const ev of events) window.addEventListener(ev, load, opts);
    // a drop before the backend is there: take the file, keep it, load
    const over = (e: DragEvent) => {
      if (!forward.current && hasFiles(e)) e.preventDefault();
    };
    const drop = (e: DragEvent) => {
      if (forward.current || !hasFiles(e)) return;
      e.preventDefault();
      const f = e.dataTransfer?.files?.[0];
      if (f) enqueue(f);
    };
    window.addEventListener("dragover", over);
    window.addEventListener("drop", drop);
    // otherwise: when the browser is idle after load, with a ceiling
    // (a pause first, so the load never lands inside the first-paint window that Lighthouse's simulation charges)
    let idle = 0;
    let timer = 0;
    const arm = () => {
      timer = window.setTimeout(() => {
        if (typeof requestIdleCallback === "function") idle = requestIdleCallback(load, { timeout: 2000 });
        else load();
      }, 3000);
    };
    if (document.readyState === "complete") arm();
    else window.addEventListener("load", arm, { once: true });
    return () => {
      for (const ev of events) window.removeEventListener(ev, load, opts);
      window.removeEventListener("dragover", over);
      window.removeEventListener("drop", drop);
      window.removeEventListener("load", arm);
      if (idle) cancelIdleCallback(idle);
      clearTimeout(timer);
    };
  }, [load, enqueue]);

  const pick = useCallback(() => {
    load();
    input.current?.click(); // synchronous with the gesture, so browsers allow it
  }, [load]);

  // "try it with our clip": the hosted sample goes through the same queue as a picked file (hidden until configured)
  const trySample = useCallback(async () => {
    setLoadError(null);
    setQueued(true);
    load();
    try {
      const res = await fetch(env.sampleClipUrl);
      if (!res.ok) throw new Error(String(res.status));
      const blob = await res.blob();
      enqueue(new File([blob], "sample.mp4", { type: blob.type || "video/mp4" }));
    } catch {
      setQueued(false);
      setLoadError("couldn't load the sample · try your own clip");
    }
  }, [enqueue, load]);

  return (
    <Ctx.Provider value={{ pick, trySample: env.sampleClipUrl ? () => void trySample() : null, busy: queued || real.busy, error: loadError ?? real.error }}>
      {children}
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
          if (f) enqueue(f);
        }}
      />
      {Backend && <Backend register={register} report={report} />}
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
