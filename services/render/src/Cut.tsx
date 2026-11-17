import { AbsoluteFill, OffthreadVideo, Sequence, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { EditDoc } from "@eyelore/core";
import { toTimeline, coverBox, faceAt, punchAt, type Segment } from "@eyelore/core";

export type CutProps = { doc: EditDoc; media: Record<string, string>; watermark: boolean };

/** Renders the edit model. Captions are the speaker's words exactly (22/26 bold white, soft shadow, scaled). */
export function Cut({ doc, media, watermark }: CutProps) {
  const { fps } = useVideoConfig();
  const tl = toTimeline(doc);
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
      <Captions chunks={tl.captions} />
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

function Captions({ chunks }: { chunks: ReturnType<typeof toTimeline>["captions"] }) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const c = chunks.find((x) => ms >= x.startMs && ms < x.endMs);
  if (!c) return null;
  const scale = width / 390; // design caption 22/26 at phone width
  return (
    <div style={{ position: "absolute", left: "6%", right: "6%", top: "64%", textAlign: "center" }}>
      <span style={{ font: `700 ${22 * scale}px/${26 * scale}px Geist, sans-serif`, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,.45), 0 2px 12px rgba(0,0,0,.35)" }}>{c.text}</span>
    </div>
  );
}
