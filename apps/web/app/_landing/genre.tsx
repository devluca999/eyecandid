"use client";
import { useEffect, useRef, useState } from "react";
import { Lens, PillButton } from "@eyelore/ui";
import { Clip, useReducedMotion, watch } from "./media";
import { CINE, WARM } from "./clips";
import { Reveal } from "./motion";

const GENRES = ["comedy", "horror", "thriller", "sports"] as const;
type Genre = (typeof GENRES)[number];
const G: Record<Genre, { label: string; f: string; cue: string; line: string; vig: number }> = {
  comedy: { label: "comedy", f: "saturate(1.4) brightness(1.1) contrast(1.04)", cue: "[laugh track]", line: "bright · snappy cuts · a laugh after every line", vig: 0 },
  horror: { label: "horror", f: "grayscale(.75) contrast(1.45) brightness(.62) sepia(.25) hue-rotate(150deg)", cue: "[a door creaks somewhere]", line: "cold · slow push-in · the nightstand is suspicious now", vig: 1 },
  thriller: { label: "thriller", f: "saturate(.55) contrast(1.3) brightness(.82) hue-rotate(-12deg)", cue: "[heartbeat, getting louder]", line: "teal · tight cuts · someone knows about the nightstand", vig: 0.6 },
  sports: { label: "sports ad", f: WARM, cue: "[crowd goes wild]", line: "same words · now it’s a shoe ad", vig: 0 },
};

/** 04 · genre switcher: media left, copy right. Cycles on its own while on screen until someone picks one. */
export function Genre() {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  const [genre, setGenre] = useState<Genre>("comedy");
  const [auto, setAuto] = useState(true);

  useEffect(() => {
    const el = ref.current;
    if (!el || reduced || !auto) return;
    let t: ReturnType<typeof setInterval> | undefined;
    const stop = watch(el, (on) => {
      clearInterval(t);
      if (on) t = setInterval(() => !document.hidden && setGenre((g) => GENRES[(GENRES.indexOf(g) + 1) % GENRES.length]!), 2600);
    }, "0px");
    return () => {
      stop();
      clearInterval(t);
    };
  }, [reduced, auto]);

  const g = G[genre];
  const sports = genre === "sports";
  return (
    <section id="genre" className="ec-sec ec-genre" aria-labelledby="genre-title">
      <Reveal className="ec-genre__media">
        <div ref={ref} className="ec-genre__stage">
          <Lens shape="rect" aspect="4 / 5" width="var(--w)" label={`the same clip, graded as ${g.label}`}>
            <Clip id={42323} filter={g.f} style={{ opacity: sports ? 0 : 1, transition: "filter .6s var(--ease-out), opacity .4s var(--ease-out)" }} />
            <Clip id={32800} filter={CINE} position="50% 60%" style={{ opacity: sports ? 1 : 0, transition: "opacity .4s var(--ease-out)" }} />
            <span className="ec-cine" style={{ opacity: sports ? 1 : 0 }} />
            <span className="ec-vignette" style={{ opacity: g.vig }} />
            <span className="ec-cap ec-cap--big">it lives on my nightstand</span>
            <span className="ec-chip ec-chip--tl">{g.cue}</span>
          </Lens>
          <div className="ec-genre__pip" style={{ opacity: sports ? 1 : 0, transform: sports ? "none" : "translateY(16px) scale(.8)" }} aria-hidden="true">
            <Lens shape="circle" width="var(--pip)" glow={false}>
              <Clip id={42323} filter={WARM} />
            </Lens>
          </div>
          <div className="ec-genre__cyc" style={{ opacity: sports ? 1 : 0, transform: sports ? "rotate(-4deg)" : "translateY(24px) rotate(-4deg) scale(.85)" }} aria-hidden="true">
            <Lens shape="rect" aspect="1 / 1" width="var(--cyc)">
              <Clip id={40865} filter={CINE} />
              <span className="ec-cine" />
            </Lens>
          </div>
        </div>
      </Reveal>
      <Reveal className="ec-copy ec-copy--down">
        <span className="ec-eyebrow">genre switcher</span>
        <h2 id="genre-title" className="ec-h2">Same words. Different movie.</h2>
        <p className="ec-body">Flip the genre and the same clip re-grades, re-paces and re-scores itself. Not one word changes. The laugh track is a choice.</p>
        <div className="ec-genre__btns" role="group" aria-label="genre">
          {GENRES.map((k) => (
            <PillButton
              key={k}
              variant={k === genre ? "primary" : "quiet"}
              onClick={() => {
                setGenre(k);
                setAuto(false);
              }}
              testId={`genre-${k}`}
            >
              {G[k].label}
            </PillButton>
          ))}
        </div>
        <span className="ec-meta" aria-live="polite">{g.line}</span>
      </Reveal>
    </section>
  );
}
