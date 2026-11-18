import { AbsoluteFill, Img, OffthreadVideo, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { BrollOverlay, EditDoc } from "@eyelore/core";
import { brollOverlays, captionCss, kenBurnsAt, toTimeline, coverBox, faceAt, punchAt, type Segment } from "@eyelore/core";

export type CutProps = { doc: EditDoc; media: Record<string, string>; watermark: boolean };

/**
 * Renders the edit model. Captions are the speaker's words exactly (22/26 bold white, soft shadow, scaled).
 * Generated b-roll stills sit over their beads, under the captions (ADR 0013).
 */
export function Cut({ doc, media, watermark }: CutProps) {
  const { fps } = useVideoConfig();
  const tl = toTimeline(doc);
  const broll = brollOverlays(doc, tl.segments);
  let at = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#0F0F10", overflow: "hidden" }}>
      {tl.segments.map((s, i) => {
        const frames = Math.max(1, Math.round(((s.toMs - s.fromMs) / 1000) * fps));
        const start = at;
        at += frames;
        return (
          <Sequence key={i} from={start} durationInFrames={frames}>
            <Shot seg={s} doc={doc} src={media[s.mediaId]} frames={frames} />
          </Sequence>
        );
      })}
      <BrollLayer overlays={broll} urls={media} />
      <Captions chunks={tl.captions} pos={captionCss(doc, doc.aspect)} />
      {watermark && (
        <div style={{ position: "absolute", right: "4%", bottom: "3%", color: "rgba(255,255,255,.8)", font: "500 34px Geist, sans-serif", textShadow: "0 1px 2px rgba(0,0,0,.4)" }}>
          eyecandid
        </div>
      )}
    </AbsoluteFill>
  );
}

function Shot({ seg, doc, src, frames }: { seg: Segment; doc: EditDoc; src?: string; frames: number }) {
  const frame = useCurrentFrame();
  const { fps, width: W, height: H } = useVideoConfig();
  const clip = doc.clips.find((c) => c.id === seg.clipId);
  if (!src || !clip) return null;
  const box = shotBox(doc, seg, W, H, seg.fromMs + (frame / fps) * 1000);
  if (!box) return null;
  return (
    <OffthreadVideo
      src={src}
      startFrom={Math.round((seg.fromMs / 1000) * fps)}
      // two-frame fades at every cut so joins never click
      volume={(f) => (frames < 6 ? 1 : interpolate(f, [0, 2, frames - 2, frames], [0, 1, 1, 0], { extrapolateLeft: "clamp", extrapolateRight: "clamp" }))}
      style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height, maxWidth: "none" }}
    />
  );
}

/**
 * Where the source sits in the output frame at a source time: face-centred cover crop, pushed in by the energy
 * dial's punch-in for that bead (the same `punchAt` the web preview uses). Clamped so the frame never shows past
 * the source edge.
 */
export function shotBox(doc: EditDoc, seg: Segment, W: number, H: number, srcMs: number) {
  const clip = doc.clips.find((c) => c.id === seg.clipId);
  if (!clip) return null;
  const face = faceAt(doc.reframe[clip.id], srcMs);
  return coverBox(clip.w, clip.h, W, H, { ...face, scale: face.scale * punchAt(doc, clip.id, srcMs) });
}

/**
 * B-roll stills over their beads: cover-cropped, a slow Ken Burns push, a short fade at each end. Spans come from
 * `brollOverlays` in core, so this, CutWeb and the Lens agree. A still with no URL is skipped, never faked.
 */
export function BrollLayer({ overlays, urls }: { overlays: BrollOverlay[]; urls: Record<string, string> }) {
  const { fps } = useVideoConfig();
  return (
    <>
      {overlays.map((o) => {
        const src = urls[o.mediaId];
        if (!src) return null;
        const from = Math.round((o.startMs / 1000) * fps);
        const frames = Math.max(1, Math.round((o.endMs / 1000) * fps) - from);
        return (
          <Sequence key={o.id} from={from} durationInFrames={frames}>
            <BrollStill o={o} src={src} />
          </Sequence>
        );
      })}
    </>
  );
}

function BrollStill({ o, src }: { o: BrollOverlay; src: string }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const { scale, opacity } = kenBurnsAt(o, o.startMs + (frame / fps) * 1000);
  return (
    <AbsoluteFill style={{ opacity, overflow: "hidden" }}>
      <Img src={src} style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }} />
    </AbsoluteFill>
  );
}

/** `pos`: captionCss from core, the spot the export quality check measured (default 64%, or the doc's safe-band place). */
function Captions({ chunks, pos }: { chunks: ReturnType<typeof toTimeline>["captions"]; pos: { top: string; transform?: string } }) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const c = chunks.find((x) => ms >= x.startMs && ms < x.endMs);
  if (!c) return null;
  const scale = width / 390; // design caption 22/26 at phone width
  return (
    <div style={{ position: "absolute", left: "6%", right: "6%", ...pos, textAlign: "center" }}>
      <span style={{ font: `700 ${22 * scale}px/${26 * scale}px Geist, sans-serif`, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,.45), 0 2px 12px rgba(0,0,0,.35)" }}>{c.text}</span>
    </div>
  );
}
