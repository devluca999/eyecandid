"use client";
import { useEffect, useRef, useState } from "react";
import { Lens, PillButton } from "@eyelore/ui";
import { Clip, useReducedMotion, watch } from "./media";
import { CINE, SLOT, WARM } from "./clips";
import { Reveal } from "./motion";

const GENRES = ["comedy", "horror", "thriller", "sports"] as const;
type Genre = (typeof GENRES)[number];
const G: Record<Genre, { label: string; f: string; cue: string; line: string; vig: number }> = {
  comedy: { label: "comedy", f: "saturate(1.4) brightness(1.1) contrast(1.04)", cue: "[laugh track]", line: "bright · snappy cuts · a laugh after every line", vig: 0 },
  horror: { label: "horror", f: "grayscale(.75) contrast(1.45) brightness(.62) sepia(.25) hue-rotate(150deg)", cue: "[a door creaks somewhere]", line: "cold · slow push-in · the cereal is suspicious now", vig: 1 },
  thriller: { label: "thriller", f: "saturate(.55) contrast(1.3) brightness(.82) hue-rotate(-12deg)", cue: "[heartbeat, getting louder]", line: "teal · tight cuts · someone knows about the cereal", vig: 0.6 },
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
            <Clip id={SLOT.genre} filter={g.f} style={{ opacity: sports ? 0 : 1, transition: "filter .6s var(--ease-out), opacity .4s var(--ease-out)" }} />
            <Clip id={SLOT.genreSports} filter={CINE} style={{ opacity: sports ? 1 : 0, transition: "opacity .4s var(--ease-out)" }} />
            <span className="ec-cine" style={{ opacity: sports ? 1 : 0 }} />
            <span className="ec-vignette" style={{ opacity: g.vig }} />
            <span className="ec-cap ec-cap--big">I’d get up early for this one</span>
            <span className="ec-chip ec-chip--tl">{g.cue}</span>
          </Lens>
        </div>
      </Reveal>
      <Reveal className="ec-copy ec-copy--down">
        <span className="ec-eyebrow">genre switcher</span>
        <h2 id="genre-title" className="ec-h2">Same words. Different movie.</h2>
        <p className="ec-body">Flip the genre and the same clip re-grades, re-paces and re-scores itself. Not one word changes. The laugh track is a choice. Coming to Pro.</p>
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
        <span className="ec-meta" aria-live={auto ? "off" : "polite"}>{g.line}</span>
      </Reveal>
    </section>
  );
}
