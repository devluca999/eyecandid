"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { coverBox, faceAt, outputAt, toTimeline, type Aspect, type Bead, type EditDoc, type EditOp } from "@eyelore/core";
import { ContextMenu, ExportPill, Icon, Lens, Lockup, StatusDot, RATIOS, type MenuItem } from "@eyelore/ui";
import { getAnonId } from "@/lib/anon";
import { session } from "@/lib/session";
import { useTrack } from "@/lib/track";
import { usePlayer } from "./usePlayer";
import { Thread, type Hover } from "./Thread";
import { Captions } from "./Captions";
import { useThumbs } from "./useThumbs";

const STAGE_WORD: Record<string, string> = {
  empty: "waiting for your clip",
  uploading: "uploading",
  transcribing: "listening",
  cutting: "trimming fillers and pauses",
  reframing: "finding your face",
  ready: "ready",
  failed: "needs you",
};
const ASPECT_RATIO: Record<Aspect, number> = { "9:16": 9 / 16, "4:5": 4 / 5, "1:1": 1, "16:9": 16 / 9 };

export function Editor({ projectId: idParam }: { projectId: string }) {
  const projectId = idParam as Id<"projects">;
  const anonId = useMemo(() => (typeof window === "undefined" ? "" : getAnonId()), []);
  const data = useQuery(api.projects.get, anonId ? { projectId, anonId } : "skip");
  const history = useQuery(api.edits.history, anonId && data?.doc?.beads.length ? { projectId, anonId, limit: 300 } : "skip");
  const presence = useQuery(api.jobs.workerPresence, {});
  const apply = useMutation(api.edits.apply);
  const undo = useMutation(api.edits.undo);
  const startExport = useMutation(api.pipeline.startExport);
  const remove = useMutation(api.projects.remove);
  const router = useRouter();
  const track = useTrack();
  const pending = useSyncExternalStore(session.subscribe, () => session.get(projectId), () => undefined);

  const doc = data?.doc as EditDoc | null | undefined;
  const clip = doc?.clips[0] ?? null;
  const sourceMedia = data?.media.find((m) => m.kind === "source");
  const src = pending?.url ?? sourceMedia?.url ?? undefined;
  const tl = useMemo(() => (doc && doc.beads.length ? toTimeline(doc) : null), [doc]);
  const player = usePlayer(tl?.segments ?? null, clip?.id ?? null);
  const thumbs = useThumbs(src, useMemo(() => doc?.beads.map((b) => b.inMs) ?? [], [doc?.beads]));

  // view: the clip's true aspect while editing; a chosen output ratio morphs the Lens
  const [view, setView] = useState<"source" | Aspect>("source");
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [momentsOnly, setMomentsOnly] = useState(false);
  const [cut, setCut] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [exportReq, setExportReq] = useState(0);
  // delete: a quiet verb, then one in-app step that says what goes and that it is final
  const [del, setDel] = useState<"idle" | "confirm" | "deleting" | "gone">("idle");
  const frame = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    const el = frame.current;
    if (!el) return;
    const ro = new ResizeObserver(([e]) => setFrameSize({ w: e!.contentRect.width, h: e!.contentRect.height }));
    ro.observe(el);
    return () => ro.disconnect();
  }, [data]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 3500);
    return () => clearTimeout(t);
  }, [notice]);

  // time-to-wow: first moment the edit is ready after the drop
  const wowSent = useRef(false);
  useEffect(() => {
    if (!wowSent.current && data?.project.stage === "ready" && pending?.droppedAt) {
      wowSent.current = true;
      track("first_preview", { msSinceDrop: Date.now() - pending.droppedAt });
    }
  }, [data?.project.stage, pending?.droppedAt, track]);

  // reasons: latest change touching a path (explain-on-hover)
  const reasonFor = useCallback(
    (path: string) => history?.find((h) => h.paths.some((p) => p === path || p.startsWith(path + "/")))?.reason,
    [history],
  );

  const commit = useCallback(
    async (ops: EditOp[], reason: string, kind: string) => {
      if (!doc) return;
      try {
        const r = await apply({ anonId, projectId, baseVersion: doc.version, ops, reason });
        if (!r.ok) setNotice("someone else just edited · try again");
        else track("edit_interaction", { kind });
      } catch (e) {
        setNotice(e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0]! : "couldn't save that");
      }
    },
    [anonId, apply, doc, projectId, track],
  );

  const toggleWord = (b: Bead, wordId: string) => {
    const w = b.words.find((x) => x.id === wordId)!;
    void commit([{ op: "set", path: `/beads/@${b.id}/words/@${w.id}/struck`, value: !w.struck }], `${w.struck ? "restored" : "cut"} · '${w.text}'`, "word");
  };
  const toggleCut = (b: Bead, cutId: string) => {
    const c = b.cuts.find((x) => x.id === cutId)!;
    const s = ((c.endMs - c.startMs) / 1000).toFixed(1);
    void commit([{ op: "set", path: `/beads/@${b.id}/cuts/@${c.id}/struck`, value: !c.struck }], `${c.struck ? "kept pause" : "cut pause"} · ${s}s`, "pause");
  };
  const toggleBead = (b: Bead) =>
    void commit([{ op: "set", path: `/beads/@${b.id}/struck`, value: !b.struck }], `${b.struck ? "kept" : "cut"} bead · '${b.words.slice(0, 3).map((w) => w.text).join(" ")}…'`, "bead");
  const retype = (wordId: string, from: string, to: string) =>
    void commit([{ op: "insert", path: "/captions/overrides/-", value: { wordId, text: to } }], `caption · '${from}' → '${to}'`, "caption");
  const setAspect = (a: Aspect) => {
    setView(a);
    if (doc && doc.aspect !== a) void commit([{ op: "set", path: "/aspect", value: a }], `aspect · ${a}`, "aspect");
  };

  const latestExport = data?.exports[0];
  const exporting = latestExport && (latestExport.status === "queued" || latestExport.status === "leased" || latestExport.status === "running");
  const doExport = async (cutOverride?: string | null) => {
    const useCut = cutOverride === undefined ? cut : cutOverride;
    if (!doc || !data || data.project.stage !== "ready") return;
    const aspect = (view === "source" ? doc.aspect : view) as Aspect;
    track("export_clicked", { aspect });
    // Clerk signup at export arrives with keys (PLAN: Needs keys); until then exports are anonymous and watermarked
    await startExport({ anonId, projectId, aspect, requestId: `${Date.now()}-${exportReq}`, ...(useCut ? { maxDurationMs: (Number(useCut) * 1000) as 15000 | 30000 | 60000 } : {}) });
    setExportReq((n) => n + 1);
  };
  const doDelete = async () => {
    setDel("deleting");
    try {
      await remove({ projectId, anonId });
      setDel("gone");
      router.replace("/");
    } catch {
      setDel("idle");
      setNotice("couldn't delete that · try again");
    }
  };
  const doneSent = useRef<string | null>(null);
  useEffect(() => {
    if (latestExport?.status === "succeeded" && doneSent.current !== latestExport._id) {
      doneSent.current = latestExport._id;
      track("export_done", { durationMs: latestExport.durationMs ?? 0, watermark: latestExport.watermark });
    }
  }, [latestExport, track]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || t.tagName === "INPUT") return;
      if (e.key === " ") {
        e.preventDefault();
        player.toggle();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "z" && doc) {
        e.preventDefault();
        void undo({ anonId, projectId, baseVersion: doc.version });
      }
      if (e.key === "Escape") {
        setDel((d) => (d === "confirm" ? "idle" : d));
        setMenu(null);
        setSelected(null);
      }
      if ((e.key === "Backspace" || e.key === "Delete") && selected && doc) {
        const b = doc.beads.find((x) => x.id === selected);
        if (b) toggleBead(b);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (del === "gone") {
    return (
      <Shell title="">
        <StatusDot status="ready" label="deleted" />
      </Shell>
    );
  }
  if (data === null) {
    return (
      <Shell title="not found">
        <p className="text-ink-secondary">This edit isn&apos;t yours, or it doesn&apos;t exist.</p>
        <Link className="el-pill el-pill--secondary" href="/">start an edit</Link>
      </Shell>
    );
  }

  // where we are, honestly
  const uploading = pending && pending.uploadProgress < 1 && !pending.error;
  const stage = data?.project.stage ?? "empty";
  const cold = presence && presence.live === 0 && stage !== "ready" && stage !== "failed" && !uploading;
  const activeJob = data?.jobs.find((j) => j.status === "running" || j.status === "leased" || j.status === "queued");
  const stageLine = pending?.error
    ? pending.error
    : uploading
      ? `uploading · ${Math.round((pending?.uploadProgress ?? 0) * 100)}%`
      : stage === "failed"
        ? data?.project.stageDetail ?? "something went wrong"
        : cold
          ? "the engine is waking up · usually under a minute"
          : stage === "ready"
            ? null
            : `${STAGE_WORD[stage] ?? stage}${activeJob?.status === "running" ? ` · ${Math.round(activeJob.progress * 100)}%` : ""}`;

  // deletable once the clip is registered (or its upload failed): deleting under a live upload would strand the file
  const canDelete = !!data && (!!sourceMedia || !!pending?.error || !pending);
  const actions = !canDelete ? null : del === "idle" ? (
    <button className="el-pill el-pill--quiet el-pill--sm" data-testid="delete" onClick={() => setDel("confirm")}>
      delete
    </button>
  ) : (
    <div className="flex flex-wrap items-center justify-end gap-8" role="alertdialog" aria-label="delete this edit" data-testid="delete-confirm">
      <span className="text-meta text-ink-secondary">delete this edit, its clip and exports for good? this can&apos;t be undone</span>
      <button className="el-pill el-pill--quiet el-pill--sm" data-testid="delete-keep" disabled={del === "deleting"} onClick={() => setDel("idle")}>
        keep
      </button>
      <button className="el-pill el-pill--secondary el-pill--sm" data-testid="delete-yes" disabled={del === "deleting"} onClick={() => void doDelete()}>
        {del === "deleting" ? "deleting" : "delete"}
      </button>
    </div>
  );

  // Lens geometry: true aspect while editing, chosen ratio when morphed
  const srcRatio = clip ? clip.w / clip.h : sourceMedia?.w && sourceMedia.h ? sourceMedia.w / sourceMedia.h : 16 / 9;
  const ratio = view === "source" ? srcRatio : ASPECT_RATIO[view];
  const width = ratio >= 1 ? "min(720px, 86vw)" : `min(${Math.round(420 * ratio)}px, 70vw)`;
  const face = clip ? faceAt(doc?.reframe[clip.id], player.srcMs) : { cx: 0.5, cy: 0.5, scale: 1 };
  const box = clip && frameSize.w ? coverBox(clip.w, clip.h, frameSize.w, frameSize.h, view === "source" ? { cx: 0.5, cy: 0.5, scale: 1 } : face) : null;
  const outMs = tl && clip ? outputAt(tl.segments, clip.id, player.srcMs) : null;
  // paused before the first kept word (e.g. on a struck "um"): show the first caption, not nothing
  const chunk = outMs != null ? tl?.captions.find((c) => outMs >= c.startMs && outMs < c.endMs) : !player.playing ? tl?.captions[0] : undefined;
  const playheadBead = doc?.beads.find((b) => player.srcMs >= b.inMs && player.srcMs < b.outMs)?.id ?? null;

  const struckWords = doc?.beads.flatMap((b) => b.words).filter((w) => w.struck).length ?? 0;
  const cutPauses = doc?.beads.flatMap((b) => b.cuts).filter((c) => c.struck).length ?? 0;
  const explain = hover
    ? { action: reasonFor(hover.path) ?? hover.fallback }
    : selected && doc
      ? { action: reasonFor(`/beads/@${selected}`) ?? "bead", bead: doc.beads.find((b) => b.id === selected) }
      : stage === "ready"
        ? { action: `${struckWords} filler${struckWords === 1 ? "" : "s"} trimmed · ${cutPauses} pause${cutPauses === 1 ? "" : "s"} cut · hover to see why` }
        : null;

  const menuItems: MenuItem[] = [
    { label: "aspect ratio", icon: "crop", submenu: RATIOS.filter((r) => r.id !== "circle").map((r) => ({ label: r.label, hint: r.hint, ratio: r.id, value: `aspect:${r.id}`, checked: view === r.id })) },
    { label: "true aspect", icon: "maximize-2", value: "aspect:source", checked: view === "source" },
    { separator: true },
    { label: momentsOnly ? "all beads" : "moments only", icon: "sparkles", value: "moments" },
    { separator: true },
    { label: "export", icon: "download", submenu: [{ label: "full length", value: "export:full" }, { label: "15s cutdown", value: "export:15" }, { label: "30s cutdown", value: "export:30" }, { label: "60s cutdown", value: "export:60" }] },
  ];
  const onMenu = (it: MenuItem) => {
    setMenu(null);
    if (!("value" in it) || !it.value) return;
    if (it.value === "aspect:source") setView("source");
    else if (it.value.startsWith("aspect:")) setAspect(it.value.slice(7) as Aspect);
    else if (it.value === "moments") setMomentsOnly((m) => !m);
    else if (it.value.startsWith("export:")) {
      const c = it.value.slice(7);
      setCut(c === "full" ? null : c);
      void doExport(c === "full" ? null : c);
    }
  };

  return (
    <Shell title={data?.project.title ?? ""} actions={actions}>
      <div className="flex flex-col items-center gap-16" onClick={() => setMenu(null)}>
        <div
          style={{ width, transition: "width var(--dur-morph) var(--spring-morph)" }}
          onContextMenu={(e) => {
            e.preventDefault();
            setMenu({ x: e.clientX, y: e.clientY });
          }}
        >
          <Lens
            shape="rect"
            width="100%"
            aspect={String(ratio)}
            scene="void"
            glow
            state={selected ? "selected" : stage !== "ready" && !pending?.error ? "generating" : "rest"}
            progress={exporting ? latestExport!.progress : null}
            label="your clip"
            style={{ transition: "aspect-ratio var(--dur-morph) var(--spring-morph)" }}
          >
            <div ref={frame} style={{ position: "absolute", inset: 0, overflow: "hidden" }} onClick={() => player.toggle()} data-testid="lens">
              {src && (
                <video
                  ref={player.video}
                  src={src}
                  playsInline
                  preload="auto"
                  onPlay={() => player.setPlaying(true)}
                  onPause={() => player.setPlaying(false)}
                  style={box ? { position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, maxWidth: "none", transition: "left 120ms linear, top 120ms linear" } : { width: "100%", height: "100%", objectFit: "cover" }}
                />
              )}
              {doc?.captions.enabled && <Captions chunk={chunk} outMs={outMs ?? 0} look={doc.captions.look} onRetype={retype} />}
              {!player.playing && src && stage === "ready" && (
                <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
                  <span className="el-glass" style={{ width: 52, height: 52, borderRadius: 999, display: "grid", placeItems: "center" }}>
                    <Icon name="play" />
                  </span>
                </div>
              )}
            </div>
          </Lens>
        </div>

        {doc && doc.beads.length > 0 && (
          <Thread
            doc={doc}
            selected={selected}
            momentsOnly={momentsOnly}
            playheadBead={playheadBead}
            thumbs={thumbs}
            onHover={setHover}
            onToggleWord={toggleWord}
            onToggleCut={toggleCut}
            onSelect={(b) => {
              setSelected((s) => (s === b.id ? null : b.id));
              player.seekSrc(b.inMs);
            }}
          />
        )}

        <div className="el-explain" style={{ minHeight: 22 }} aria-live="polite" data-testid="explain">
          {notice ? (
            <span>{notice}</span>
          ) : stageLine ? (
            <StatusDot status={stage === "failed" || pending?.error ? "attention" : "working"} label={stageLine} />
          ) : explain ? (
            <>
              {explain.action}
              {"bead" in explain && explain.bead && (
                <button className="el-pill el-pill--quiet el-pill--sm" onClick={() => toggleBead(explain.bead!)}>
                  {explain.bead.struck ? "keep" : "cut"}
                </button>
              )}
            </>
          ) : null}
        </div>

        {stage === "ready" && doc && (
          <ExportPill
            value={view === "source" ? doc.aspect : view}
            onChange={(r) => setAspect(r as Aspect)}
            cut={cut}
            onCut={setCut}
            onExport={() => void doExport()}
            phase={exporting ? "rendering" : latestExport?.status === "succeeded" ? "done" : "idle"}
            progress={exporting ? latestExport!.progress : undefined}
            stage={exporting ? latestExport!.stage : undefined}
            downloadUrl={latestExport?.url}
          />
        )}
        {latestExport?.status === "failed" && <StatusDot status="attention" label={`export failed · ${latestExport.error ?? ""}`.slice(0, 120)} />}
      </div>

      {menu && (
        <div style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 50 }} onClick={(e) => e.stopPropagation()}>
          <ContextMenu items={menuItems} onSelect={onMenu} />
        </div>
      )}
    </Shell>
  );
}

function Shell({ title, actions, children }: { title: string; actions?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh flex flex-col">
      <header className="flex flex-wrap items-center gap-16 px-24 py-16">
        <Link href="/" aria-label="home">
          <Lockup height={22} />
        </Link>
        <span className="text-meta text-ink-secondary truncate">{title}</span>
        {actions && <div className="ml-auto">{actions}</div>}
      </header>
      <section className="flex flex-1 flex-col items-center justify-start gap-24 px-24 pb-64 pt-16">{children}</section>
    </main>
  );
}
