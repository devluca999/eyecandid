"use client";
import { useEffect, useState } from "react";
import { PillButton } from "@eyelore/ui";
import { useUploader } from "../drop";

/** The floating glass pill: shows once the hero has scrolled away, hides while the final drop is on screen. */
export function FloatingPill() {
  const { pick } = useUploader();
  const [heroGone, setHeroGone] = useState(false);
  const [finalIn, setFinalIn] = useState(false);
  useEffect(() => {
    const hero = document.querySelector(".ec-hero");
    const fin = document.getElementById("final");
    const io = new IntersectionObserver((es) => {
      for (const e of es) {
        if (e.target === hero) setHeroGone(!e.isIntersecting && e.boundingClientRect.top < 0);
        if (e.target === fin) setFinalIn(e.isIntersecting);
      }
    }, { rootMargin: "-80px 0px 0px 0px" });
    if (hero) io.observe(hero);
    if (fin) io.observe(fin);
    return () => io.disconnect();
  }, []);
  const on = heroGone && !finalIn;
  return (
    <div className={"ec-pill" + (on ? " is-on" : "")} inert={!on}>
      <span>got an awkward take?</span>
      <PillButton onClick={pick}>drop a clip</PillButton>
    </div>
  );
}
