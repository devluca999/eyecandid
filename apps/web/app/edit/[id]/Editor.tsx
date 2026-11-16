"use client";
import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { coverBox, faceAt, outputAt, punchAt, toTimeline, type Aspect, type Bead, type EditDoc, type EditOp } from "@eyelore/core";
import { ContextMenu, ExportPill, Icon, Lens, Lockup, StatusDot, RATIOS, type MenuItem } from "@eyelore/ui";
import { getAnonId } from "@/lib/anon";
import { session } from "@/lib/session";
import { useTrack } from "@/lib/track";
import { usePlayer } from "./usePlayer";
import { Thread, type Hover } from "./Thread";
import { Captions } from "./Captions";
import { useThumbs } from "./useThumbs";
import { DialStrip, dialLine, useDials, type DialKey } from "./Dials";
import { Drawer } from "./Drawer";
import { Board } from "./Board";
import { Help, Tour, TOUR, TOUR_KEY } from "./Help";

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
const MODES = ["theater", "edit", "board"] as const;
type Mode = (typeof MODES)[number];

const readStore = (k: string) => {
  try {
    return window.localStorage.getItem(k);
  } catch {
    return null;
  }
};
const writeStore = (k: string, v: string) => {
  try {
    window.localStorage.setItem(k, v);
  } catch {
    /* private mode: the tour just shows again next time */
  }
};
const interactive = (t: HTMLElement) => !!t.closest("button, a, input, textarea, select, [role=slider], [role=button], [contenteditable=true]");

export function Editor({ projectId: idParam }: { projectId: string }) {
  const projectId = idParam as Id<"projects">;
  const anonId = useMemo(() => (typeof window === "undefined" ? "" : getAnonId()), []);
  const data = useQuery(api.projects.get, anonId ? { projectId, anonId } : "skip");
  const history = useQuery(api.edits.history, anonId && data?.doc?.beads.length ? { projectId, anonId, limit: 300 } : "skip");
  const presence = useQuery(api.jobs.workerPresence, {});
  const apply = useMutation(api.edits.apply);
  const undo = useMutation(api.edits.undo);
  const startExport = useMutation(api.pipeline.startExport);
  const track = useTrack();
  const pending = useSyncExternalStore(session.subscribe, () => session.get(projectId), () => undefined);

  const [notice, setNotice] = useState<string | null>(null);
  const serverDoc = data?.doc as EditDoc | null | undefined;
  const dialState = useDials(serverDoc, anonId, projectId, setNotice);
  // what you see: the server doc, plus any dial move that is still on its way
  const doc = dialState.preview;
  const clip = doc?.clips[0] ?? null;
  const sourceMedia = data?.media.find((m) => m.kind === "source");
  const src = pending?.url ?? sourceMedia?.url ?? undefined;
  const tl = useMemo(() => (doc && doc.beads.length ? toTimeline(doc) : null), [doc]);
  const player = usePlayer(tl?.segments ?? null, clip?.id ?? null);
  const thumbs = useThumbs(src, useMemo(() => serverDoc?.beads.map((b) => b.inMs) ?? [], [serverDoc?.beads]));

  const [mode, setModeState] = useState<Mode>("edit");
  const [themeOverride, setThemeOverride] = useState<"paper" | "night" | null>(null);
  // view: the clip's true aspect while editing; a chosen output ratio morphs the Lens
  const [view, setView] = useState<"source" | Aspect>("source");
  const [selected, setSelected] = useState<string | null>(null);
  const [hover, setHover] = useState<Hover>(null);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [momentsOnly, setMomentsOnly] = useState(false);
  const [cut, setCut] = useState<string | null>(null);
  const [exportReq, setExportReq] = useState(0);
  const [drawer, setDrawer] = useState(false);
  const [sheet, setSheet] = useState(false);
  const [tour, setTour] = useState<number | null>(null);
  const [nearDials, setNearDials] = useState(false);
  const [activeDial, setActiveDial] = useState<DialKey | null>(null);
  const frame = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState({ w: 0, h: 0 });

  const night = (themeOverride ?? (mode === "theater" ? "night" : "paper")) === "night";
  useEffect(() => {
    document.documentElement.dataset.theme = night ? "night" : "paper";
    return () => {
      document.documentElement.dataset.theme = "paper";
    };
  }, [night]);

  const setMode = useCallback(
    (m: Mode) => {
      setModeState(m);
      setThemeOverride(null);
      setMenu(null);
      setDrawer(false);
      setActiveDial(null);
      setNearDials(false);
      if (m === "theater") player.play();
      if (m === "board") player.pause();
      track("edit_interaction", { kind: `mode_${m}` });
    },
    [player, track],
  );

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

  // first-run tour: once the edit is ready, unless you've finished or skipped it before
  const stage = data?.project.stage ?? "empty";
  useEffect(() => {
    if (stage === "ready" && readStore(TOUR_KEY) !== "done") setTour((t) => t ?? 0);
  }, [stage]);
  const endTour = useCallback(() => {
    setTour(null);
    writeStore(TOUR_KEY, "done");
  }, []);
  const stepTour = useCallback(
    (d: number) => {
      setTour((t) => {
        if (t === null) return t;
        const n = t + d;
        if (n >= TOUR.length) {
          writeStore(TOUR_KEY, "done");
          return null;
        }
        return Math.max(0, n);
      });
      if (mode !== "edit") setMode("edit");
    },
    [mode, setMode],
  );

  // reasons: latest change touching a path (explain-on-hover)
  const reasonFor = useCallback(
    (path: string) => history?.find((h) => h.paths.some((p) => p === path || p.startsWith(path + "/")))?.reason,
    [history],
  );

  const commit = useCallback(
    async (ops: EditOp[], reason: string, kind: string) => {
      if (!serverDoc) return;
      try {
        const r = await apply({ anonId, projectId, baseVersion: serverDoc.version, ops, reason });
        if (!r.ok) setNotice("someone else just edited · try again");
        else track("edit_interaction", { kind });
      } catch (e) {
        setNotice(e instanceof Error ? e.message.replace(/^.*Uncaught Error: /, "").split("\n")[0]! : "couldn't save that");
      }
    },
    [anonId, apply, serverDoc, projectId, track],
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
    if (serverDoc && serverDoc.aspect !== a) void commit([{ op: "set", path: "/aspect", value: a }], `aspect · ${a}`, "aspect");
  };
  const selectBead = (b: Bead) => {
    setSelected((s) => (s === b.id ? null : b.id));
    player.seekSrc(b.inMs);
  };
  const turnDial = (k: DialKey, v: number) => {
    setActiveDial(k);
    dialState.change(k, v);
  };

  const latestExport = data?.exports[0];
  const exporting = latestExport && (latestExport.status === "queued" || latestExport.status === "leased" || latestExport.status === "running");
  const doExport = async (cutOverride?: string | null) => {
    const useCut = cutOverride === undefined ? cut : cutOverride;
    if (!serverDoc || !data || data.project.stage !== "ready") return;
    const aspect = (view === "source" ? serverDoc.aspect : view) as Aspect;
    track("export_clicked", { aspect });
    // Clerk signup at export arrives with keys (PLAN: Needs keys); until then exports are anonymous and watermarked
    await startExport({ anonId, projectId, aspect, requestId: `${Date.now()}-${exportReq}`, ...(useCut ? { maxDurationMs: (Number(useCut) * 1000) as 15000 | 30000 | 60000 } : {}) });
    setExportReq((n) => n + 1);
  };
  const doneSent = useRef<string | null>(null);
  useEffect(() => {
    if (latestExport?.status === "succeeded" && doneSent.current !== latestExport._id) {
      doneSent.current = latestExport._id;
      track("export_done", { durationMs: latestExport.durationMs ?? 0, watermark: latestExport.watermark });
    }
  }, [latestExport, track]);

  // every shortcut here is listed in Help.tsx KEYS
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement;
      if (t.isContentEditable || t.tagName === "INPUT" || t.tagName === "TEXTAREA") return;
      if (e.key === "Escape") {
        // one layer per press: tour, sheet, drawer, menu, selection
        if (tour !== null) endTour();
        else if (sheet) setSheet(false);
        else if (drawer) setDrawer(false);
        else if (menu) setMenu(null);
        else setSelected(null);
        return;
      }
      if (e.altKey && e.code === "KeyT") {
        e.preventDefault();
        if (mode !== "edit") setMode("edit");
        setDrawer((d) => !d);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "z" && serverDoc) {
        e.preventDefault();
        void undo({ anonId, projectId, baseVersion: serverDoc.version });
        return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === "?") {
        setSheet((s) => !s);
        return;
      }
      if (tour !== null && (e.key === "ArrowRight" || e.key === "ArrowLeft") && t.getAttribute("role") !== "slider") {
        e.preventDefault();
        stepTour(e.key === "ArrowRight" ? 1 : -1);
        return;
      }
      if (e.key === "1" || e.key === "2" || e.key === "3") {
        setMode(MODES[Number(e.key) - 1]!);
        return;
      }
      if (e.key === " ") {
        if (interactive(t)) return; // space on a focused control presses it
        e.preventDefault();
        player.toggle();
        return;
      }
      if ((e.key === "m" || e.key === "M") && mode === "edit") setMomentsOnly((m) => !m);
      if ((e.key === "Backspace" || e.key === "Delete") && selected && serverDoc) {
        const b = serverDoc.beads.find((x) => x.id === selected);
        if (b) toggleBead(b);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  if (data === null) {
    return (
      <Shell title="not found" night={false}>
        <p className="text-ink-secondary">This edit isn&apos;t yours, or it doesn&apos;t exist.</p>
        <Link className="el-pill el-pill--secondary" href="/">start an edit</Link>
      </Shell>
    );
  }

  // where we are, honestly
  const uploading = pending && pending.uploadProgress < 1 && !pending.error;
  const cold = presence && presence.live === 0 && stage !== "ready" && stage !== "failed" && !uploading;
  const activeJob = data?.jobs.find((j) => j.status === "running" || j.status === "leased" || j.status === "queued");
  const stageLine = pending?.error
    ? pending.error
    : uploading
      ? `uploading · ${Math.round((pending?.uploadProgress ?? 0) * 100)}%`
      : stage === "failed"
        ? data?.project.stageDetail ?? "something went wrong"
        : cold
          ? "the engine is cold · waiting for a worker to start"
          : stage === "ready"
            ? null
            : `${STAGE_WORD[stage] ?? stage}${activeJob?.status === "running" ? ` · ${Math.round(activeJob.progress * 100)}%` : ""}`;
  const ready = stage === "ready" && !!doc && doc.beads.length > 0;

  // Lens geometry: circle in theater, true aspect (or the chosen ratio) while editing, a card on the board
  const srcRatio = clip ? clip.w / clip.h : sourceMedia?.w && sourceMedia.h ? sourceMedia.w / sourceMedia.h : 16 / 9;
  const editRatio = view === "source" ? srcRatio : ASPECT_RATIO[view];
  const ratio = mode === "theater" ? 1 : mode === "board" ? 9 / 16 : editRatio;
  const width =
    mode === "theater" ? "min(620px, 64vh, 86vw)" : mode === "board" ? "120px" : editRatio >= 1 ? "min(720px, 86vw)" : `min(${Math.round(420 * editRatio)}px, 70vw)`;
  const face = clip ? faceAt(doc?.reframe[clip.id], player.srcMs) : { cx: 0.5, cy: 0.5, scale: 1 };
  // energy punch-ins: the same resolver the renderer uses (services/render shotBox)
  const punch = doc && clip ? punchAt(doc, clip.id, player.srcMs) : 1;
  const trueAspect = mode === "edit" && view === "source";
  const box =
    clip && frameSize.w
      ? coverBox(clip.w, clip.h, frameSize.w, frameSize.h, trueAspect ? { cx: 0.5, cy: 0.5, scale: punch } : { ...face, scale: face.scale * punch })
      : null;
  const outMs = tl && clip ? outputAt(tl.segments, clip.id, player.srcMs) : null;
  // paused before the first kept word (e.g. on a struck "um"): show the first caption, not nothing
  const chunk = outMs != null ? tl?.captions.find((c) => outMs >= c.startMs && outMs < c.endMs) : !player.playing ? tl?.captions[0] : undefined;
  const playheadBead = doc?.beads.find((b) => player.srcMs >= b.inMs && player.srcMs < b.outMs)?.id ?? null;
  const progress = tl && tl.durationMs ? (outMs ?? 0) / tl.durationMs : 0;

  const struckWords = doc?.beads.flatMap((b) => b.words).filter((w) => w.struck).length ?? 0;
  const cutPauses = doc?.beads.flatMap((b) => b.cuts).filter((c) => c.struck).length ?? 0;
  const explain =
    activeDial && doc
      ? { action: dialLine(activeDial, doc, dialState.dials) }
      : hover
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

  const dialsShown = nearDials || tour !== null && TOUR[tour]!.anchor === "dials";

  return (
    <Shell
      title={data?.project.title ?? ""}
      night={night}
      center={
        <div className="el-seg eyl-modes" role="radiogroup" aria-label="view" data-tour="modes">
          {MODES.map((m, i) => (
            <button key={m} className={"el-seg__opt" + (mode === m ? " is-on" : "")} role="radio" aria-checked={mode === m} onClick={() => setMode(m)} title={`${m} · ${i + 1}`} data-testid={`mode-${m}`}>
              {m}
            </button>
          ))}
        </div>
      }
      right={
        <button className="el-iconbtn" onClick={() => setThemeOverride(night ? "paper" : "night")} aria-label={night ? "paper theme" : "night theme"} data-testid="theme">
          <Icon name={night ? "sun" : "moon"} size={18} />
        </button>
      }
    >
      <div className={`eyl-stage eyl-stage--${mode}`} data-mode={mode} data-duration-ms={tl?.durationMs ?? 0} data-testid="stage" onClick={() => setMenu(null)}>
        <div className="eyl-stack">
          <div
            className="eyl-lenswrap"
            data-tour="lens"
            data-testid="lens-wrap"
            style={{ width }}
            onContextMenu={(e) => {
              if (mode !== "edit") return;
              e.preventDefault();
              setMenu({ x: e.clientX, y: e.clientY });
            }}
            onPointerMove={(e) => {
              if (mode !== "edit" || !ready) return;
              const r = e.currentTarget.getBoundingClientRect();
              setNearDials(e.clientX - r.left < Math.max(110, Math.min(160, r.width * 0.32)));
            }}
            onPointerLeave={() => setNearDials(false)}
          >
            <Lens
              shape={mode === "theater" ? "circle" : mode === "board" ? "card" : "rect"}
              width="100%"
              aspect={String(ratio)}
              scene="void"
              glow={mode !== "board"}
              state={selected && mode === "edit" ? "selected" : stage !== "ready" && !pending?.error ? "generating" : "rest"}
              progress={exporting && mode === "edit" ? latestExport!.progress : null}
              label="your clip"
              style={{ width: "100%" }}
            >
              <div
                ref={frame}
                style={{ position: "absolute", inset: 0, overflow: "hidden", cursor: mode === "theater" ? "zoom-in" : undefined }}
                onClick={() => (mode === "theater" ? setMode("edit") : player.toggle())}
                data-testid="lens"
              >
                {src && (
                  <video
                    ref={player.video}
                    src={src}
                    playsInline
                    preload="auto"
                    data-punch={punch.toFixed(2)}
                    data-testid="footage"
                    onPlay={() => player.setPlaying(true)}
                    onPause={() => player.setPlaying(false)}
                    style={box ? { position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, maxWidth: "none", transition: "left 120ms linear, top 120ms linear" } : { width: "100%", height: "100%", objectFit: "cover" }}
                  />
                )}
                {doc?.captions.enabled && mode !== "board" && <Captions chunk={chunk} outMs={outMs ?? 0} look={doc.captions.look} onRetype={retype} readOnly={mode === "theater"} />}
                {!player.playing && src && stage === "ready" && mode === "edit" && (
                  <div style={{ position: "absolute", inset: 0, display: "grid", placeItems: "center", pointerEvents: "none" }}>
                    <span className="el-glass" style={{ width: 52, height: 52, borderRadius: 999, display: "grid", placeItems: "center" }}>
                      <Icon name="play" />
                    </span>
                  </div>
                )}
              </div>
            </Lens>
            {mode === "theater" && (
              <svg className="eyl-theaterring" viewBox="0 0 100 100" aria-hidden="true">
                <circle cx="50" cy="50" r="49.4" className="eyl-theaterring__base" />
                {progress > 0.002 && <circle cx="50" cy="50" r="49.4" className="eyl-theaterring__arc" pathLength={1} strokeDasharray={`${progress} 1`} />}
              </svg>
            )}
            {mode === "edit" && ready && (
              <div className={"eyl-dialbox" + (dialsShown ? " is-shown" : "")} data-tour="dials">
                <DialStrip dials={dialState.dials} onChange={turnDial} busy={dialState.busy} onActive={setActiveDial} />
              </div>
            )}
          </div>
          {mode === "board" && doc && doc.beads.length > 0 && (
            <Board
              doc={doc}
              title={data?.project.title ?? ""}
              selected={selected}
              playheadBead={playheadBead}
              thumbs={thumbs}
              onSelect={selectBead}
              onOpen={(b) => {
                setSelected(b.id);
                player.seekSrc(b.inMs);
                setMode("edit");
              }}
              onToggle={toggleBead}
            />
          )}
        </div>

        {mode === "theater" && (
          <button className="el-glass el-glass--float eyl-playpill" onClick={(e) => (e.stopPropagation(), player.toggle())} aria-label={player.playing ? "pause" : "play"} data-testid="theater-play">
            <Icon name={player.playing ? "pause" : "play"} size={16} />
            <span className="el-tc">{fmtTc(outMs ?? 0)} / {fmtTc(tl?.durationMs ?? 0)}</span>
          </button>
        )}

        {mode === "edit" && doc && doc.beads.length > 0 && (
          <div data-tour="thread">
            <Thread
              doc={doc}
              selected={selected}
              momentsOnly={momentsOnly}
              playheadBead={playheadBead}
              thumbs={thumbs}
              onHover={setHover}
              onToggleWord={toggleWord}
              onToggleCut={toggleCut}
              onSelect={selectBead}
            />
          </div>
        )}

        {mode !== "theater" && (
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
        )}

        {stage === "ready" && serverDoc && mode === "edit" && (
          <ExportPill
            value={view === "source" ? serverDoc.aspect : view}
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
        {latestExport?.status === "failed" && mode === "edit" && <StatusDot status="attention" label={`export failed · ${latestExport.error ?? ""}`.slice(0, 120)} />}
      </div>

      {ready && doc && tl && clip && (
        <>
          {mode === "edit" && !drawer && (
            <button className="el-glass el-glass--float eyl-drawerhandle" onClick={() => setDrawer(true)} aria-label="open the timeline" aria-expanded={false} data-testid="timeline-handle">
              <span className="el-drawer__grip" />
              <span>timeline</span>
              <span className="el-kbd">⌥T</span>
            </button>
          )}
          <Drawer
            open={drawer && mode === "edit"}
            doc={doc}
            segments={tl.segments}
            captions={tl.captions}
            srcMs={player.srcMs}
            outMs={outMs}
            outDurationMs={tl.durationMs}
            playing={player.playing}
            thumbs={thumbs}
            onSeek={player.seekSrc}
            onToggle={player.toggle}
            onClose={() => setDrawer(false)}
          />
        </>
      )}

      {menu && (
        <div style={{ position: "fixed", left: menu.x, top: menu.y, zIndex: 50 }} onClick={(e) => e.stopPropagation()}>
          <ContextMenu items={menuItems} onSelect={onMenu} />
        </div>
      )}

      {mode !== "theater" && <Help open={sheet} onToggle={() => setSheet((s) => !s)} onTour={() => (setSheet(false), setMode("edit"), setTour(0))} />}
      {tour !== null && ready && mode === "edit" && <Tour step={tour} onNext={() => stepTour(1)} onPrev={() => stepTour(-1)} onSkip={endTour} />}
    </Shell>
  );
}

const fmtTc = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.floor((ms / 1000) % 60)).padStart(2, "0")}`;

function Shell({ title, night, center, right, children }: { title: string; night: boolean; center?: React.ReactNode; right?: React.ReactNode; children: React.ReactNode }) {
  return (
    <main className="min-h-dvh flex flex-col">
      <header className="eyl-top">
        <div className="eyl-top__l">
          <Link href="/" aria-label="home">
            <Lockup height={22} theme={night ? "night" : "paper"} />
          </Link>
          <span className="text-meta text-ink-secondary truncate">{title}</span>
        </div>
        <div>{center}</div>
        <div className="eyl-top__r">{right}</div>
      </header>
      <section className="flex flex-1 flex-col items-center justify-start gap-24 px-24 pb-96 pt-16">{children}</section>
    </main>
  );
}
