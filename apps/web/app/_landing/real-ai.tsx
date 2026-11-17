"use client";
import { useState } from "react";
import { Lens } from "@eyelore/ui";
import { Clip } from "./media";
import { RAW, SLOT, WARM, type ClipId } from "./clips";
import { Reveal } from "./motion";
import { hoverable } from "./reel";

/** 06 · real and ai: media left, copy right. Hover (tap, Enter) shows both raw. */
export function RealAi() {
  const [raw, setRaw] = useState(false);
  const tile = (id: ClipId, cap: string, name: string, off?: boolean) => (
    <div className={"ec-pair__tile" + (off ? " ec-pair__tile--off" : "")}>
      <Lens shape="card" width="var(--w)">
        <Clip id={id} filter={raw ? RAW : WARM} style={{ transition: "filter .5s var(--ease-out)" }} />
        <span className="ec-cap ec-cap--card" style={{ opacity: raw ? 0 : 1, transition: "opacity .3s" }}>{cap}</span>
      </Lens>
      <span className="ec-ui">{name}</span>
    </div>
  );
  return (
    <section className="ec-sec ec-pair" aria-labelledby="pair-title">
      <Reveal className="ec-pair__media">
        <button
          type="button"
          className="ec-pair__btn"
          aria-pressed={raw}
          onMouseEnter={() => hoverable() && setRaw(true)}
          onMouseLeave={() => hoverable() && setRaw(false)}
          onClick={(e) => (e.detail === 0 || !hoverable()) && setRaw((r) => !r)}
        >
          {tile(SLOT.real, "post it once, it’s everywhere", "real")}
          {tile(SLOT.ai, "every single morning", "ai", true)}
          <span className="ec-sr">show both raw</span>
        </button>
      </Reveal>
      <Reveal className="ec-copy ec-copy--down">
        <span className="ec-eyebrow">real or ai</span>
        <h2 id="pair-title" className="ec-h2">Phone or prompt. Same polish.</h2>
        <p className="ec-body">Real footage and AI footage go through the same edit, on the same timeline. Same captions, same grade, same pacing. No favourites.</p>
        <span className="ec-meta">
          {raw ? "raw · both of them · equally unbothered" : (
            <>
              <span className="ec-hover">hover</span>
              <span className="ec-tap">tap</span> to see both raw · stock clip stands in for ai
            </>
          )}
        </span>
      </Reveal>
    </section>
  );
}
