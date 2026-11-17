"use client";
import { useState } from "react";
import { Lens } from "@eyelore/ui";
import { Clip } from "./media";
import { RAW, WARM, type ClipId } from "./clips";
import { Reveal } from "./motion";

const REEL: { k: string; clip: ClipId; shape: "card" | "rect" | "circle"; aspect?: string; cap: string; raw: string; lab: string; rawLab: string }[] = [
  { k: "a", clip: 41272, shape: "card", cap: "okay. three drops. that’s it.", raw: "okay so um… three, three drops", lab: "edit · 0:24", rawLab: "raw · take 4" },
  { k: "b", clip: 42308, shape: "rect", aspect: "4 / 5", cap: "it lives on my nightstand", raw: "so it, uh… lives on my", lab: "edit · 0:31", rawLab: "raw · take 2" },
  { k: "c", clip: 41181, shape: "circle", cap: "and it comes in this", raw: "and it, wait, hold on", lab: "", rawLab: "" },
  { k: "d", clip: 810, shape: "rect", aspect: "1 / 1", cap: "", raw: "", lab: "b-roll · graded", rawLab: "raw · shaky" },
];

export const hoverable = () => window.matchMedia("(hover: hover)").matches;

function Tile({ t, raw, onRaw }: { t: (typeof REEL)[number]; raw: boolean; onRaw: (on: boolean) => void }) {
  const cap = raw ? t.raw : t.cap;
  const lab = raw ? t.rawLab : t.lab;
  return (
    <button
      type="button"
      className={`ec-reeltile ec-reeltile--${t.k}`}
      aria-pressed={raw}
      onMouseEnter={() => hoverable() && onRaw(true)}
      onMouseLeave={() => hoverable() && onRaw(false)}
      // a mouse previews on hover; a tap, the keyboard or a screen reader (click with detail 0) toggles
      onClick={(e) => (e.detail === 0 || !hoverable()) && onRaw(!raw)}
    >
      <Lens shape={t.shape} aspect={t.aspect} width="var(--w)">
        <Clip id={t.clip} filter={raw ? RAW : WARM} style={{ transition: "filter .5s var(--ease-out)" }} />
        {cap && <span className={`ec-cap ec-cap--${t.shape}`}>{cap}</span>}
        {lab && <span className="ec-chip ec-chip--tl">{lab}</span>}
      </Lens>
      <span className="ec-sr">show the raw take</span>
    </button>
  );
}

/** 02 · the reel: media left, copy right. Hover (tap, or Enter) shows the raw take under each edit. */
export function Reel() {
  const [raw, setRaw] = useState<string | null>(null);
  const tile = (k: string) => <Tile t={REEL.find((t) => t.k === k)!} raw={raw === k} onRaw={(on) => setRaw((cur) => (on ? k : cur === k ? null : cur))} />;
  return (
    <section id="how" className="ec-sec ec-reel" aria-labelledby="reel-title">
      <Reveal className="ec-reel__media">
        {tile("a")}
        <div className="ec-reel__b">{tile("b")}</div>
        <div className="ec-reel__col">
          {tile("c")}
          {tile("d")}
        </div>
      </Reveal>
      <Reveal className="ec-copy">
        <span className="ec-eyebrow">the reel</span>
        <h2 id="reel-title" className="ec-h2">Same people. Same phones. Better takes.</h2>
        <p className="ec-body">Every edit here has a raw take underneath. Hover one to see it. We’re not proud of it either.</p>
        <span className="ec-meta">demo edits on stock footage</span>
      </Reveal>
    </section>
  );
}
