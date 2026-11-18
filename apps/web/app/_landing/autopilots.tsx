"use client";
import { useEffect, useRef, useState } from "react";
import { Icon, Lens, StatusDot, type Status } from "@eyelore/ui";
import { Clip, useReducedMotion, watch } from "./media";
import { SLOT, WARM } from "./clips";
import { Reveal } from "./motion";

const PROMPT = "make the background space";
const TRACKS: { name: string; why: string; status: Status; word: string }[] = [
  { name: "video", why: "best take · steadiest voice · no ums", status: "ready", word: "ready" },
  { name: "b-roll", why: "cut away · you said ‘the view’", status: "attention", word: "1 to check" },
  { name: "voice", why: "removed 2 fillers · 1 pause · 1.8s", status: "ready", word: "ready" },
  { name: "music", why: "ducks under your voice · back up on the cut", status: "ready", word: "ready" },
  { name: "captions", why: "word-timed · spelled right · your words", status: "working", word: "captioning" },
];
type Phase = "typing" | "working" | "done";

/**
 * 05 · autopilots: copy left, media right. The select-and-talk bubble plays a short, looping demonstration (it is an
 * illustration, not an input: nothing here pretends to edit anything).
 */
export function Autopilots() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [typed, setTyped] = useState("");
  const [phase, setPhase] = useState<Phase>("typing");

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      setPhase("done");
      return;
    }
    let t: ReturnType<typeof setTimeout> | undefined;
    const run = (i: number) => {
      if (i <= PROMPT.length) {
        setPhase("typing");
        setTyped(PROMPT.slice(0, i));
        t = setTimeout(() => run(i + 1), i === 0 ? 1200 : 55 + Math.random() * 50);
      } else
        t = setTimeout(() => {
          setTyped("");
          setPhase("working");
          t = setTimeout(() => {
            setPhase("done");
            t = setTimeout(() => run(0), 4500);
          }, 1900);
        }, 500);
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

  const reply = phase === "working" ? `working on ‘${PROMPT}’` : phase === "done" ? `done · ${PROMPT} · you stay exactly as you were` : null;
  const filter = phase === "working" ? "blur(8px) saturate(.6)" : phase === "done" ? "saturate(.8) contrast(1.15) brightness(.86) hue-rotate(-14deg)" : WARM;
  return (
    <section className="ec-sec ec-auto" aria-labelledby="auto-title">
      <Reveal className="ec-auto__media">
        <div ref={ref} className="ec-bubble" role="img" aria-label={`a demonstration: someone selects the background and asks to ${PROMPT}`}>
          <div className="ec-bubble__glass">
            <div className="ec-bubble__ctx">
              <Icon name="mouse-pointer-2" size={14} />
              selected · background
            </div>
            {reply && (
              <div className="ec-bubble__reply">
                <Icon name="sparkles" size={16} />
                <span>{reply}</span>
              </div>
            )}
            <div className="ec-bubble__row">
              <span className={"ec-bubble__field" + (typed ? "" : " is-empty")}>{typed || "what should change?"}</span>
              <span className={"ec-bubble__send" + (typed ? " is-on" : "")}>
                <Icon name="arrow-up" />
              </span>
            </div>
            {phase === "done" && (
              <div className="ec-bubble__chips">
                {["warmer", "tighter", "cut the ums"].map((c) => (
                  <span key={c} className="ec-bubble__chip">{c}</span>
                ))}
              </div>
            )}
          </div>
          <span className="ec-bubble__tail" />
        </div>
        <Lens shape="rect" aspect="4 / 5" width="var(--w)" state={phase === "working" ? "generating" : "selected"} label="a talking-head clip with its background selected">
          <Clip id={SLOT.autopilots} filter={filter} style={{ transition: "filter 1s var(--ease-out)" }} />
          <span className="ec-space" style={{ opacity: phase === "done" ? 1 : 0 }} />
          <span className="ec-chip ec-chip--tl">
            <StatusDot status={phase === "done" ? "ready" : "working"} showLabel={false} />
            {phase === "working" ? "working" : phase === "done" ? "ready" : "background"}
          </span>
        </Lens>
        <span className="ec-meta" style={{ textAlign: "center" }}>select-and-talk</span>
      </Reveal>
      <Reveal className="ec-copy ec-copy--wide">
        <span className="ec-eyebrow">autopilots</span>
        <h2 id="auto-title" className="ec-h2">Every track drives itself.</h2>
        <p className="ec-body">Five tracks, five autopilots. You only step in when one raises its hand. Cuts, voice and captions drive themselves today; b-roll, music and select-and-talk are next.</p>
        <ul className="ec-tracks">
          {TRACKS.map((t) => (
            <li key={t.name}>
              <span className="ec-tracks__name">{t.name}</span>
              <span className="ec-tracks__why">
                <span>{t.why}</span>
                <StatusDot status={t.status} label={t.word} />
              </span>
            </li>
          ))}
        </ul>
      </Reveal>
    </section>
  );
}
