"use client";
import { useRef } from "react";
import { BROLL_NOTE, sourceAt, TRACK_ORDER, type CaptionChunk, type EditDoc, type Segment, type TrackKind } from "@eyelore/core";
import { Icon } from "@eyelore/ui";

const NAME: Record<TrackKind, string> = { video: "video", broll: "b-roll", voice: "voice", music: "music", captions: "captions" };

/**
 * design/components/timeline/TimelineDrawer on real data, on the source clip's own time axis: video shows what is
 * kept and what is struck (from toTimeline), voice the spoken words, captions the caption chunks. b-roll and music
 * have nothing yet and say so. Tracks in the product's fixed order (TRACK_ORDER).
 */
export function Drawer({
  open, doc, segments, captions, srcMs, outMs, outDurationMs, playing, thumbs, onSeek, onToggle, onClose,
}: {
  open: boolean; doc: EditDoc; segments: Segment[]; captions: CaptionChunk[]; srcMs: number; outMs: number | null; outDurationMs: number;
  playing: boolean; thumbs: Record<number, string>; onSeek: (srcMs: number) => void; onToggle: () => void; onClose: () => void;
}) {
  const lanes = useRef<HTMLDivElement>(null);
  const clip = doc.clips[0];
  const total = Math.max(1, clip?.durationMs ?? 0, ...doc.beads.map((b) => b.outMs));
  const pct = (ms: number) => `${(Math.max(0, Math.min(total, ms)) / total) * 100}%`;
  const span = (a: number, b: number) => ({ left: pct(a), width: `calc(${pct(b - a)} - 1px)` });

  // video: kept ranges, and the struck ranges between them inside each bead
  const kept = segments.map((s) => ({ ...s, bead: doc.beads.find((b) => b.clipId === s.clipId && s.fromMs >= b.inMs && s.fromMs < b.outMs) }));
  const struck: { from: number; to: number }[] = [];
  for (const b of doc.beads) {
    let cur = b.inMs;
    for (const s of segments.filter((x) => x.clipId === b.clipId && x.fromMs >= b.inMs && x.toMs <= b.outMs).sort((x, y) => x.fromMs - y.fromMs)) {
      if (s.fromMs - cur > 40) struck.push({ from: cur, to: s.fromMs });
      cur = Math.max(cur, s.toMs);
    }
    if (b.outMs - cur > 40) struck.push({ from: cur, to: b.outMs });
  }
  const words = doc.beads.flatMap((b) => b.words.map((w) => ({ ...w, struck: w.struck || b.struck })));
  const caps = captions.flatMap((c) => {
    const a = sourceAt(segments, c.startMs);
    const z = sourceAt(segments, Math.max(c.startMs, c.endMs - 1));
    return a ? [{ text: c.text, from: a.srcMs, to: z && z.srcMs > a.srcMs ? z.srcMs : a.srcMs + (c.endMs - c.startMs) }] : [];
  });

  const seekAt = (clientX: number) => {
    const r = lanes.current!.getBoundingClientRect();
    onSeek(((clientX - r.left) / r.width) * total);
  };
  const fmt = (ms: number) => `${String(Math.floor(ms / 60000)).padStart(2, "0")}:${((ms / 1000) % 60).toFixed(2).padStart(5, "0")}`;

  return (
    <div className={"eyl-drawer" + (open ? " is-open" : "")} aria-hidden={!open} inert={!open} data-testid="timeline">
      <div className="el-glass el-drawer" role="region" aria-label="timeline">
        <div className="el-drawer__grip" />
        <div className="el-drawer__head">
          <span style={{ font: "var(--font-ui)" }}>timeline</span>
          <span className="el-kbd">⌥T</span>
          <span style={{ flex: 1 }} />
          <button className="el-iconbtn" style={{ width: 28, height: 28 }} onClick={onToggle} aria-label={playing ? "pause" : "play"}>
            <Icon name={playing ? "pause" : "play"} size={14} />
          </button>
          <span className="el-tc">
            {fmt(outMs ?? 0)} <span style={{ color: "var(--ink-secondary)" }}>/ {fmt(outDurationMs)}</span>
          </span>
          <span style={{ flex: 1 }} />
          <button className="el-iconbtn" onClick={onClose} aria-label="close timeline">
            <Icon name="x" size={16} />
          </button>
        </div>
        <div className="el-tracks" style={{ paddingTop: 12 }}>
          {TRACK_ORDER.map((k) => (
            <Track key={k} kind={k}>
              {k === "video" && (
                <>
                  {struck.map((s, i) => (
                    <div key={"s" + i} className="eyl-struck" style={span(s.from, s.to)} title="struck · restorable from the thread" />
                  ))}
                  {kept.map((s, i) => (
                    <div
                      key={"k" + i}
                      className="el-clip"
                      style={{
                        ...span(s.fromMs, s.toMs),
                        backgroundImage: s.bead && thumbs[s.bead.inMs] ? `url(${thumbs[s.bead.inMs]})` : undefined,
                        backgroundSize: "auto 100%",
                        backgroundColor: "var(--surface-sunken)",
                      }}
                    />
                  ))}
                </>
              )}
              {k === "broll" && <span className="eyl-ghostlane">{BROLL_NOTE}</span>}
              {k === "voice" &&
                words.map((w) => (
                  <i key={w.id} className={"eyl-word" + (w.struck ? " is-struck" : "")} style={span(w.startMs, w.endMs)} title={w.text} />
                ))}
              {k === "music" && <span className="eyl-ghostlane">no music yet</span>}
              {k === "captions" &&
                caps.map((c, i) => (
                  <span key={i} className="el-capword" style={{ ...span(c.from, c.to), overflow: "hidden" }}>
                    {c.text}
                  </span>
                ))}
            </Track>
          ))}
          <div
            ref={lanes}
            className="eyl-seek"
            role="slider"
            tabIndex={0}
            aria-label="playhead · click or use arrow keys to seek"
            aria-valuemin={0}
            aria-valuemax={Math.round(total / 1000)}
            aria-valuenow={Math.round(srcMs / 1000)}
            aria-valuetext={fmt(outMs ?? 0)}
            data-testid="timeline-seek"
            onPointerDown={(e) => seekAt(e.clientX)}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight" || e.key === "ArrowLeft") {
                e.preventDefault();
                e.stopPropagation();
                onSeek(srcMs + (e.key === "ArrowRight" ? 1 : -1) * (e.shiftKey ? 5000 : 1000));
              }
            }}
          >
            <div className="el-playhead" style={{ left: pct(srcMs) }} data-testid="timeline-playhead" />
          </div>
        </div>
      </div>
    </div>
  );
}

function Track({ kind, children }: { kind: TrackKind; children: React.ReactNode }) {
  return (
    <>
      <span className="el-track__name" data-testid="track-name">{NAME[kind]}</span>
      <div className={"el-track__lane" + (kind === "captions" || kind === "music" ? " el-track__lane--short" : "")} data-track={kind} style={kind === "video" ? { height: 44 } : undefined}>
        {children}
      </div>
    </>
  );
}
