"use client";
import { useLayoutEffect, useRef, useState } from "react";
import { Icon } from "@eyelore/ui";

/** Every real shortcut in the editor. The keydown handler in Editor.tsx is the source; keep the two in step. */
export const KEYS: [string, string][] = [
  ["space", "play / pause"],
  ["1 · 2 · 3", "theater · edit · board"],
  ["⌥T", "timeline"],
  ["⌘Z", "undo your last change"],
  ["delete", "cut or keep the selected bead"],
  ["M", "moments only"],
  ["↑ ↓", "turn a focused dial"],
  ["← →", "seek in the timeline (⇧ 5s)"],
  ["enter", "pick a bead · open a card in edit"],
  ["right-click", "ratio, moments, export"],
  ["?", "this sheet"],
  ["esc", "close · skip the tour"],
];

export type TourStep = { anchor: string; title: string; body: string };
export const TOUR: TourStep[] = [
  { anchor: "lens", title: "your edit", body: "it plays the cut, not the raw clip. right-click for ratio and export." },
  { anchor: "thread", title: "the thread", body: "one bead per sentence. struck words were trimmed · click one to restore it." },
  { anchor: "dials", title: "dials", body: "hover the lens's left edge. pace and energy re-edit the whole cut, live." },
  { anchor: "modes", title: "views", body: "theater, edit, board · or 1, 2, 3. ? lists every shortcut." },
];
export const TOUR_KEY = "eyelore.tour.v1";

/** The "?" pill (bottom left, as in the UI kit) and the shortcut sheet it opens. Non-modal. */
export function Help({ open, onToggle, onTour }: { open: boolean; onToggle: () => void; onTour: () => void }) {
  return (
    <div className="eyl-help">
      {open && (
        <div className="el-glass el-glass--float eyl-cheat el-pop" role="dialog" aria-label="shortcuts" data-testid="shortcuts">
          <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 12 }}>
            <span style={{ font: "var(--font-ui)" }}>shortcuts</span>
            <button className="el-pill el-pill--quiet el-pill--sm" onClick={onTour} style={{ color: "var(--ink)", padding: "0 4px" }}>
              take the tour
            </button>
          </div>
          <dl className="eyl-cheat__grid">
            {KEYS.map(([k, d]) => (
              <div key={k} style={{ display: "contents" }}>
                <dt>
                  <kbd className="el-kbd">{k}</kbd>
                </dt>
                <dd>{d}</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
      <button className="el-glass el-glass--float eyl-helppill" onClick={onToggle} aria-expanded={open} aria-label="shortcuts" data-testid="help">
        <span className="el-kbd">?</span>shortcuts
      </button>
    </div>
  );
}

type Rect = { left: number; top: number; right: number; bottom: number };
const hits = (a: Rect, b: Rect) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * First-run tour: a glass bar beside the control it is about (never over the footage), next / back / skip.
 * Arrow keys step, Escape skips (Editor.tsx). Never modal: everything stays clickable.
 */
export function Tour({ step, onNext, onPrev, onSkip }: { step: number; onNext: () => void; onPrev: () => void; onSkip: () => void }) {
  const bar = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<{ left: number; top: number } | null>(null);
  const s = TOUR[step]!;

  useLayoutEffect(() => {
    const place = () => {
      const el = document.querySelector(`[data-tour="${s.anchor}"]`);
      const b = bar.current;
      if (!el || !b) return setPos({ left: 16, top: 72 });
      const a = el.getBoundingClientRect();
      const lensEl = document.querySelector('[data-tour="lens"]');
      const lens = lensEl ? lensEl.getBoundingClientRect() : null;
      const w = b.offsetWidth;
      const h = b.offsetHeight;
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const gap = 14;
      // phones: no room beside anything, so sit at the bottom edge, above the help pill
      if (vw < 640) return setPos({ left: 16, top: vh - h - 64 });
      const cands = [
        { left: a.right + gap, top: a.top + a.height / 2 - h / 2 },
        { left: a.left - w - gap, top: a.top + a.height / 2 - h / 2 },
        { left: a.left + a.width / 2 - w / 2, top: a.bottom + gap },
        { left: a.left + a.width / 2 - w / 2, top: a.top - h - gap },
      ].map((c) => ({ left: Math.max(16, Math.min(vw - w - 16, c.left)), top: Math.max(72, Math.min(vh - h - 16, c.top)) }));
      const ok = cands.find((c) => {
        const r = { left: c.left, top: c.top, right: c.left + w, bottom: c.top + h };
        return (!lens || !hits(r, lens)) && (s.anchor === "lens" || !hits(r, a));
      });
      setPos(ok ?? { left: 16, top: 72 });
    };
    place();
    const t = setTimeout(place, 500); // after a morph settles
    window.addEventListener("resize", place);
    return () => {
      clearTimeout(t);
      window.removeEventListener("resize", place);
    };
  }, [s.anchor]);

  return (
    <div
      ref={bar}
      className="el-glass el-glass--float eyl-tourbar"
      role="dialog"
      aria-label={`tour · ${step + 1} of ${TOUR.length}`}
      aria-live="polite"
      data-testid="tour"
      style={{ left: pos?.left ?? -9999, top: pos?.top ?? 0, visibility: pos ? "visible" : "hidden" }}
    >
      <span className="el-tc" style={{ color: "var(--ink-secondary)" }}>
        {step + 1} / {TOUR.length}
      </span>
      <span className="eyl-tour__txt">
        <b>{s.title}</b>
        <span>{s.body}</span>
      </span>
      <button className="el-iconbtn" onClick={onPrev} disabled={step === 0} aria-label="previous">
        <Icon name="chevron-left" size={18} />
      </button>
      <button className="el-pill el-pill--primary el-pill--sm" onClick={onNext}>
        {step === TOUR.length - 1 ? "done" : "next"}
      </button>
      <button className="el-iconbtn" onClick={onSkip} aria-label="skip the tour" data-testid="tour-skip">
        <Icon name="x" size={16} />
      </button>
    </div>
  );
}
