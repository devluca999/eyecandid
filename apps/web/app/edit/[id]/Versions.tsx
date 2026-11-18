"use client";
import { useMemo } from "react";
import { outputAt, toTimeline, type EditDoc, type VersionId } from "@eyelore/core";
import { Lens } from "@eyelore/ui";
import { previews, versionCards, type VersionCard } from "@/lib/versions-picker";
import { Captions } from "./Captions";
import { usePlayer } from "./usePlayer";

const noop = () => {};

/** One version of the take: a small Lens that plays the cut muted while hovered or focused. The whole card is one button. */
function Card({ card, doc, src, ratio, busy, onPick }: { card: VersionCard; doc: EditDoc; src: string | undefined; ratio: number; busy: boolean; onPick: (id: VersionId) => void }) {
  const tl = useMemo(() => toTimeline(doc), [doc]);
  const clip = doc.clips[0] ?? null;
  const player = usePlayer(tl.segments, clip?.id ?? null);
  const first = tl.segments[0]?.fromMs ?? 0;
  const start = () => player.play();
  const stop = () => {
    player.pause();
    player.seekSrc(first);
  };
  const outMs = clip ? outputAt(tl.segments, clip.id, player.srcMs) : null;
  const chunk = outMs != null ? tl.captions.find((c) => outMs >= c.startMs && outMs < c.endMs) : tl.captions[0];
  return (
    <li className="eyl-ver" data-version={card.id} data-current={card.current ? "1" : undefined}>
      <button
        type="button"
        className="eyl-ver__btn"
        aria-label={card.name}
        aria-pressed={card.current}
        disabled={busy}
        data-testid={`version-${card.id}`}
        onPointerEnter={start}
        onPointerLeave={stop}
        onFocus={start}
        onBlur={stop}
        onClick={() => onPick(card.id)}
      >
        <Lens width="100%" aspect={String(ratio)} scene="void" glow={false} state={card.current ? "selected" : "rest"}>
          <div style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
            {src && (
              <video
                ref={player.video}
                src={src}
                muted
                playsInline
                preload="metadata"
                aria-hidden="true"
                tabIndex={-1}
                onLoadedMetadata={() => player.seekSrc(first)}
                onPlay={() => player.setPlaying(true)}
                onPause={() => player.setPlaying(false)}
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
            )}
            {doc.captions.enabled && <Captions chunk={chunk} outMs={outMs ?? 0} look={doc.captions.look} onRetype={noop} readOnly />}
          </div>
        </Lens>
        <span className="eyl-ver__title">{card.title}</span>
        <span className="eyl-ver__blurb">{card.blurb}</span>
      </button>
    </li>
  );
}

/**
 * Three versions of the same take, side by side (docs/goal-plan-build.md §3). Offered only once the first edit is
 * ready. Picking one is one explained, undoable change; the current version carries the accent. On a phone the
 * three cards swipe sideways.
 */
export function VersionPicker({ doc, src, ratio, busy, onPick, onHide }: { doc: EditDoc; src: string | undefined; ratio: number; busy: boolean; onPick: (id: VersionId) => void; onHide: () => void }) {
  const cards = useMemo(() => versionCards(doc), [doc]);
  const docs = useMemo(() => previews(doc), [doc]);
  return (
    <section className="eyl-versions" aria-label="three versions of this take" data-testid="versions">
      <div className="eyl-versions__head">
        <span className="text-meta text-ink-secondary">three versions of this take · pick one</span>
        <button type="button" className="el-pill el-pill--quiet el-pill--sm" onClick={onHide} data-testid="versions-hide">
          hide
        </button>
      </div>
      <ul className="eyl-versions__row" role="group" aria-label="versions">
        {cards.map((c) => (
          <Card key={c.id} card={c} doc={docs[c.id]} src={src} ratio={ratio} busy={busy} onPick={onPick} />
        ))}
      </ul>
    </section>
  );
}
