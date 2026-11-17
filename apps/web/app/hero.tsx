"use client";
import { useEffect } from "react";
import { preload } from "react-dom";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { HERO_LINES, heroVariant } from "@eyelore/core/flags";
import { Lens, Lockup, PillButton } from "@eyelore/ui";
import { getAnonId } from "@/lib/anon";
import { HERO_LINE_SCRIPT } from "@/lib/hero-line";
import { DropWell, useUploader } from "./drop";
import { Recent } from "./recent";
import { Clip } from "./_landing/media";
import { BRIGHT, CINE, SLOT, SOFT, poster } from "./_landing/clips";

/** The four tiles shown on every screen size: their posters are in the HTML and fetched early (phones show only these). */
const FIRST = [SLOT.heroFar, SLOT.heroRun, SLOT.heroCine, SLOT.heroBroll];

/** 01 · hero: centred line, the real drop well, and scattered clips (sharp near, blurred far) with parallax. */
export function Hero() {
  const track = useMutation(api.events.track);
  const { pick } = useUploader();
  for (const id of FIRST) preload(poster(id), { as: "image", fetchPriority: "high" });
  // Hero line, A/B tested (flag hero_line_ab). "Making real people look great." is the control (variant a).
  // Both lines are in the HTML; HERO_LINE_SCRIPT picks one before first paint, so the h1 never re-renders.
  useEffect(() => {
    const anonId = getAnonId();
    const v = heroVariant(anonId);
    document.documentElement.setAttribute("data-hero", v);
    void track({
      anonId,
      event: { name: "landing_view", props: { platform: "web", variant: v, heroLine: HERO_LINES[v] } },
    });
  }, [track]);

  return (
    <>
      <section className="ec-hero" aria-labelledby="hero-title">
        <script dangerouslySetInnerHTML={{ __html: HERO_LINE_SCRIPT }} />
        <div className="ec-scatter" aria-hidden="true">
          <div data-depth="0.25" className="ec-t ec-t--far">
            <Lens shape="circle" width="var(--w)" glow={false}>
              <Clip eager id={SLOT.heroFar} filter={SOFT} />
            </Lens>
          </div>
          <div data-depth="0.3" className="ec-t ec-t--portrait ec-desk">
            <Lens shape="card" width={200} glow={false}>
              <Clip id={SLOT.heroPortrait} filter={BRIGHT} />
            </Lens>
          </div>
          <div data-depth="0.35" className="ec-t ec-t--rose ec-desk">
            <Lens shape="rect" aspect="4 / 5" width={180} glow={false}>
              <Clip id={SLOT.heroRose} filter={SOFT} />
            </Lens>
          </div>
          <div data-depth="0.6" className="ec-t ec-t--run">
            <div style={{ transform: "rotate(-4deg)" }}>
              <Lens shape="card" width="var(--w)">
                <Clip eager id={SLOT.heroRun} filter={CINE} position="50% 60%" />
                <span className="ec-cine" />
              </Lens>
            </div>
          </div>
          <div data-depth="0.5" className="ec-t ec-t--cine">
            <div style={{ transform: "rotate(3deg)" }}>
              <Lens shape="rect" aspect="4 / 5" width="var(--w)">
                <Clip eager id={SLOT.heroCine} filter="saturate(.65) contrast(1.18) brightness(.88)" />
              </Lens>
            </div>
          </div>
          <div data-depth="0.7" className="ec-t ec-t--broll">
            <div style={{ transform: "rotate(2deg)" }}>
              <Lens shape="rect" aspect="1 / 1" width="var(--w)">
                <Clip eager id={SLOT.heroBroll} filter={BRIGHT} />
              </Lens>
            </div>
          </div>
          <div data-depth="0.8" className="ec-t ec-t--cyc ec-desk">
            <div style={{ transform: "rotate(-3deg)" }}>
              <Lens shape="rect" aspect="4 / 5" width={220}>
                <Clip id={SLOT.heroCyclist} filter={CINE} />
                <span className="ec-cine" />
              </Lens>
            </div>
          </div>
          <div data-depth="1.1" className="ec-t ec-t--c1 ec-desk">
            <Lens shape="circle" width={112}>
              <Clip id={SLOT.heroCircleSmall} filter={SOFT} />
            </Lens>
          </div>
          <div data-depth="1.2" className="ec-t ec-t--sq ec-desk">
            <div style={{ transform: "rotate(5deg)" }}>
              <Lens shape="rect" aspect="1 / 1" width={96}>
                <Clip id={SLOT.heroSquare} filter={BRIGHT} />
              </Lens>
            </div>
          </div>
          <div data-depth="1" className="ec-t ec-t--c2 ec-desk">
            <Lens shape="circle" width={128}>
              <Clip id={SLOT.heroCircle} filter="saturate(1.35) brightness(1.08)" />
            </Lens>
          </div>
        </div>
        <div className="ec-scrim" aria-hidden="true" />

        <nav className="ec-nav" aria-label="main">
          <a href="/" className="ec-nav__home">
            <Lockup height={20} />
          </a>
          <span style={{ flex: 1 }} />
          <a href="#how" className="ec-nav__link ec-desk">
            how it works
          </a>
          <a href="#pricing" className="ec-nav__link ec-desk">
            pricing
          </a>
          <PillButton onClick={pick}>drop a clip</PillButton>
        </nav>

        <div className="ec-hero__copy">
          <span className="ec-eyebrow">ai video editor for creators and ugc ads</span>
          <div className="ec-hero__line">
            <h1 id="hero-title" className="ec-h1">
              <span className="ec-line-a">{HERO_LINES.a}</span>
              <span className="ec-line-b">{HERO_LINES.b}</span>
            </h1>
          </div>
          <p className="ec-hero__sub">Drop the awkward take. Get back the one you’d actually post.</p>
          <div className="ec-hero__well">
            <DropWell
              id="drop"
              testId="choose-clip"
              title="drop your rawest clip"
              hint="the more ums the better · mp4, mov"
              height={172}
            />
          </div>
          <span className="ec-meta">about a minute · ums out · captions in · your words stay yours</span>
        </div>
      </section>
      {/* edits started in this browser: in flow just below the hero (always below the fold, so it shifts nothing seen) */}
      <div className="ec-hero__recent">
        <Recent />
      </div>
    </>
  );
}
