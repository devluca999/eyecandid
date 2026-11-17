"use client";
import { useEffect, useRef, useState } from "react";
import { Icon, Lens, StatusDot, type IconName, type Status } from "@eyelore/ui";
import { Clip, useReducedMotion, watch } from "./media";
import { SLOT } from "./clips";
import { Reveal } from "./motion";

/** The menu in the demo. Hints say which plan each move belongs to; none of it is in the editor yet (see the tag). */
const MOVES: { label: string; icon: IconName; hint: string }[] = [
  { label: "color grade like this clip", icon: "palette", hint: "pro" },
  { label: "add a dolly zoom here", icon: "zoom-in", hint: "pro" },
  { label: "tighten the pauses", icon: "scissors", hint: "free" },
];

type Cursor = "home" | "a" | "b" | 0 | 1 | 2;
type Step = {
  ms: number; cursor: Cursor; note: string; dot: Status;
  sel?: boolean; menu?: 0 | 1 | 2; hot?: boolean; drag?: boolean; grade?: boolean; dolly?: boolean; tight?: boolean;
};

/**
 * One unhurried loop (~18s): select the middle clip, right-click, grade it like the clip beside it (drag that clip
 * onto it: "match this look"), right-click, dolly zoom, right-click, tighten the pauses. Each step keeps what the
 * ones before it did. The last entry is the still that reduced motion shows.
 */
const G = { sel: true, grade: true };
const STEPS: Step[] = [
  { ms: 1400, cursor: "home", note: "your clips, side by side", dot: "ready" },
  { ms: 1000, cursor: "b", note: "select one", dot: "ready", sel: true },
  { ms: 650, cursor: "b", note: "right-click it", dot: "ready", sel: true, menu: 0 },
  { ms: 1100, cursor: 0, note: "right-click it", dot: "ready", sel: true, menu: 0, hot: true },
  { ms: 1000, cursor: "a", note: "pick the look to match", dot: "attention", sel: true },
  { ms: 1200, cursor: "b", note: "match this look", dot: "working", sel: true, drag: true },
  { ms: 1900, cursor: "home", note: "graded like the club clip", dot: "ready", ...G },
  { ms: 650, cursor: "b", note: "right-click again", dot: "ready", ...G, menu: 1 },
  { ms: 1100, cursor: 1, note: "right-click again", dot: "ready", ...G, menu: 1, hot: true },
  { ms: 2600, cursor: "home", note: "dolly zoom · in on his face", dot: "ready", ...G, dolly: true },
  { ms: 650, cursor: "b", note: "and once more", dot: "ready", ...G, dolly: true, menu: 2 },
  { ms: 1100, cursor: 2, note: "and once more", dot: "ready", ...G, dolly: true, menu: 2, hot: true },
  { ms: 3000, cursor: "home", note: "pauses tightened", dot: "ready", ...G, dolly: true, tight: true },
];
const STILL: Step = { ms: 0, cursor: 2, note: "graded, pushed in, pauses tightened", dot: "ready", ...G, dolly: true, tight: true, menu: 2, hot: true };

/** A spoken line under the selected clip, pauses shown the way the editor's thread shows them ("· 1.2s"). */
const LINE: { w: string; pause?: boolean }[] = [
  { w: "okay" }, { w: "· 1.2s", pause: true }, { w: "so" }, { w: "this" }, { w: "· 0.9s", pause: true }, { w: "is" }, { w: "the" }, { w: "one" },
];

/** 03b · inline edits: right after the walkthrough, copy above a three-clip board with one looping demonstration. */
export function Inline() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [i, setI] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    let t: ReturnType<typeof setTimeout> | undefined;
    const run = (k: number) => {
      setI(k);
      t = setTimeout(() => run((k + 1) % STEPS.length), STEPS[k]!.ms);
    };
    const stop = watch(el, (on) => {
      clearTimeout(t);
      if (on) run(0);
    }, "0px");
    return () => {
      stop();
      clearTimeout(t);
    };
  }, [reduced]);

  const s = reduced ? STILL : STEPS[i]!;
  return (
    <section id="inline" className="ec-sec ec-inline" aria-labelledby="inline-title">
      <Reveal className="ec-copy ec-inline__copy">
        <span className="ec-eyebrow">right on the picture</span>
        <h2 id="inline-title" className="ec-h2">Point at a clip. Pick the move.</h2>
        <p className="ec-body">
          Coming to Pro: lay your clips side by side, right-click one and pick what it needs. Grade it like the clip next to
          it, push in with a dolly zoom, tighten the pauses.
        </p>
        <span className="ec-meta">today: one take per edit, right-click it for shape and cutdowns, and the pace dial tightens the pauses</span>
      </Reveal>
      <Reveal className="ec-inline__media">
        <span className="ec-glasschip ec-inline__tag">
          <span className="el-dot el-dot--draft" aria-hidden="true" />
          pro · coming soon
        </span>
        <div
          ref={ref}
          className="ec-inline__stage"
          role="img"
          aria-label="an illustration of a coming Pro feature: three clips side by side; the middle one is right-clicked and graded like its neighbour, pushed in with a dolly zoom, and its pauses tightened"
          data-step={reduced ? "still" : i}
        >
          <div className={"ec-inline__slot ec-inline__slot--a" + (s.drag ? " is-drag" : "")}>
            <Lens shape="rect" aspect="4 / 5" width="var(--cw)" state={s.cursor === "a" ? "hover" : "rest"}>
              <Clip id={SLOT.inlineRef} />
              <span className="ec-chip ec-chip--tl">club · neon</span>
            </Lens>
          </div>
          <div className={"ec-inline__slot ec-inline__slot--b" + (s.drag ? " is-over" : "")} data-cursor={String(s.cursor)}>
            <Lens shape="rect" aspect="4 / 5" width="var(--cw)" state={s.sel ? "selected" : "rest"}>
              <Clip
                id={SLOT.inlineSelected}
                position="50% 0%"
                filter={s.grade ? "contrast(1.12) saturate(1.25) brightness(.9)" : undefined}
                style={{
                  transform: s.dolly ? "scale(1.24)" : "none",
                  transformOrigin: "50% 16%",
                  transition: s.dolly ? "transform 2.2s var(--ease-out), filter .9s var(--ease-out)" : "transform .6s var(--ease-out), filter .9s var(--ease-out)",
                }}
              />
              <span className="ec-inline__tint" style={{ opacity: s.grade ? 1 : 0 }} />
              <span className="ec-vignette" style={{ opacity: s.dolly ? 0.5 : 0 }} />
              {s.drag && <span className="ec-chip ec-inline__drop">match this look</span>}
            </Lens>
            <p className={"ec-inline__line" + (s.tight ? " is-tight" : "")} aria-hidden="true">
              {LINE.map((x, k) => (
                <span key={k} className={x.pause ? "ec-inline__pause" : undefined}>{x.w}</span>
              ))}
            </p>
            {s.menu !== undefined && (
              <div className="el-glass el-menu ec-inline__menu" aria-hidden="true">
                {MOVES.map((m, k) => (
                  <div key={m.label} className={"el-menu__item" + (s.hot && s.menu === k ? " is-open" : "")}>
                    <Icon name={m.icon} size={16} />
                    <span className="el-menu__label">{m.label}</span>
                    <span className="el-menu__hint">{m.hint}</span>
                  </div>
                ))}
              </div>
            )}
            <span className="ec-inline__cursor" aria-hidden="true">
              <Icon name="mouse-pointer-2" size={22} />
            </span>
          </div>
          <div className="ec-inline__slot ec-inline__slot--c">
            <Lens shape="rect" aspect="4 / 5" width="var(--cw)">
              <Clip id={SLOT.inlineThird} />
            </Lens>
          </div>
        </div>
        <span className="ec-glasschip ec-inline__note">
          <StatusDot status={s.dot} showLabel={false} />
          <span>{s.note}</span>
        </span>
      </Reveal>
    </section>
  );
}
