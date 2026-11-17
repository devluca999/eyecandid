"use client";
import { useEffect, useRef, useState } from "react";
import { Lens, StatusDot, type Status } from "@eyelore/ui";
import { Clip, useReducedMotion, watch } from "./media";
import { CINE, RAW, SLOT, WARM } from "./clips";

const SEQ: { t: string; b: string; chip: string; dot: Status }[] = [
  { t: "You film it. Awkwardly.", b: "Three takes, two ums, one long look at the ceiling. Normal.", chip: "raw · take 3 · 2 ums", dot: "attention" },
  { t: "We cut the ums.", b: "Fillers and dead air come out. Every cut says why, so you can put any of it back.", chip: "removed 2 fillers · 1 pause · 1.8s", dot: "working" },
  { t: "We say it back, clearly.", b: "Word-timed captions, spelled right. We polish how you said it, never what you said.", chip: "captions · word-timed", dot: "working" },
  { t: "We weave in the b-roll.", b: "You said ‘nightstand’, so we cut to the nightstand.", chip: "cut away · you said ‘nightstand’", dot: "working" },
  { t: "We fix the light.", b: "One grade across every clip, so your face and the b-roll share the same afternoon. Coming soon.", chip: "grade · warm afternoon", dot: "working" },
  { t: "We find the beat.", b: "Music under your voice. It ducks when you talk and comes back up on the cut. Coming soon.", chip: "music ducks under your voice", dot: "working" },
  { t: "From cringe to cinema.", b: "Cut, captioned and reframed in about a minute today. The b-roll, grade and music are on the way.", chip: "ready · 0:31", dot: "ready" },
];
const LAST = SEQ.length - 1;

/** The music lane of the design-system WeaveTrack (kind="music"): a waveform that ducks under the voice. */
function MusicLane() {
  const wave = Array.from({ length: 100 }, (_, i) => 0.25 + Math.abs(Math.sin(i * 0.7 + 3) * Math.cos(i * 0.23 + 6)) * 0.75);
  return (
    <div className="ec-lane">
      <span className="ec-lane__name">
        music
        <span className="ec-lane__mode">autopilot</span>
      </span>
      <svg viewBox="0 0 400 28" preserveAspectRatio="none" aria-hidden="true">
        {wave.map((v, i) => {
          const d = i / 100 >= 1 / 31 && i / 100 < 29 / 31 ? 0.5 : 1;
          return <rect key={i} x={i * 4} y={14 - v * 12 * d} width="2" height={v * 24 * d} rx="1" fill="var(--ink-tertiary)" />;
        })}
      </svg>
    </div>
  );
}

/**
 * 03 · cringe to cinema: copy left, a pinned Lens right; scrolling walks one take through the seven steps.
 * Every step stays in the DOM (a list a screen reader or keyboard user reads in order); the skip link jumps past the
 * pinned stretch. With reduced motion nothing pins and the Lens shows the finished edit.
 */
export function Sequence() {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const [step, setStep] = useState(0);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced) return;
    const onScroll = () => {
      const r = el.getBoundingClientRect();
      const p = Math.min(0.999, Math.max(0, -r.top / (r.height - window.innerHeight)));
      setStep(Math.floor(p * SEQ.length));
    };
    let on = false;
    const stop = watch(el, (vis) => {
      if (vis && !on) window.addEventListener("scroll", onScroll, { passive: true });
      if (!vis && on) window.removeEventListener("scroll", onScroll);
      on = vis;
      if (vis) onScroll();
    }, "0px");
    return () => {
      stop();
      window.removeEventListener("scroll", onScroll);
    };
  }, [reduced]);

  const s = reduced ? LAST : step;
  const shape = s < 2 ? "card" : s < 6 ? "rect" : "circle";
  const filter = s < 2 ? RAW : s < 4 ? "saturate(.8) contrast(.94)" : s < 6 ? WARM : CINE;

  return (
    <section ref={ref} className={"ec-seq" + (reduced ? " is-static" : "")} aria-labelledby="seq-title" data-step={s}>
      <a href="#genre" className="ec-skip">skip the walkthrough</a>
      <div className="ec-seq__pin">
        <div className="ec-seq__media">
          <div className="ec-seq__tilt" style={{ transform: s === 0 ? "rotate(-3deg)" : "none" }}>
            <Lens shape={shape} aspect="4 / 5" width={`var(--w-${shape})`} state={s === 1 ? "generating" : "rest"} label="one take, from raw to finished edit">
              <Clip id={SLOT.walkthrough} filter={filter} style={{ transition: "filter .7s var(--ease-out)" }} />
              <Clip id={SLOT.walkthroughBroll} filter={WARM} style={{ opacity: s === 3 ? 1 : 0, transition: "opacity .45s var(--ease-out)" }} />
              <span className="ec-cine" style={{ opacity: s === 6 ? 1 : 0, transition: "opacity .7s var(--ease-out)" }} />
              <span className="ec-cap ec-cap--seq" style={{ bottom: shape === "circle" ? "20%" : "10%", opacity: s >= 2 ? 1 : 0 }}>
                it lives on my nightstand
              </span>
            </Lens>
          </div>
          <span className="ec-glasschip" aria-live="polite">
            <StatusDot status={SEQ[s]!.dot} showLabel={false} />
            <span>{SEQ[s]!.chip}</span>
          </span>
          <div className="ec-seq__music" style={{ opacity: s >= 5 ? 1 : 0 }}>
            <MusicLane />
          </div>
        </div>
        <div className="ec-seq__copy">
          <span id="seq-title" className="ec-eyebrow ec-desk">one take, start to finish</span>
          <ol className="ec-steps">
            {SEQ.map((x, i) => (
              <li key={x.t} className={"ec-step" + (i === s ? " is-on" : i < s ? " is-past" : "")} aria-current={i === s ? "step" : undefined}>
                <span className={"ec-step__t" + (i === LAST ? " is-last" : "")}>{x.t}</span>
                <span className="ec-step__b">{x.b}</span>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
