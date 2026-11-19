"use client";
import { AbsoluteFill, Img, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { Video } from "@remotion/media";
import { loadFont } from "@remotion/google-fonts/Geist";
import { brollOverlays, captionCss, coverBox, faceAt, kenBurnsAt, toTimeline, type BrollOverlay, type EditDoc, type Segment } from "@eyelore/core";

const { fontFamily } = loadFont("normal", { weights: ["500", "700"], subsets: ["latin"] });

/** `stills`: signed URLs of the doc's generated b-roll stills, by mediaId (from authorizeDeviceExport); empty on Free. */
export type CutWebProps = { doc: EditDoc; src: string; watermark: boolean; stills?: Record<string, string> };

/**
 * The browser twin of services/render/src/Cut.tsx for @remotion/web-renderer: same timeline maths
 * (toTimeline and brollOverlays from core), <Video> from @remotion/media instead of <OffthreadVideo>, Geist via google-fonts.
 */
export function CutWeb({ doc, src, watermark, stills = {} }: CutWebProps) {
  const { fps, width: W, height: H } = useVideoConfig();
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
            <Shot seg={s} doc={doc} src={src} W={W} H={H} fps={fps} />
          </Sequence>
        );
      })}
      {broll.map((o) => {
        const url = stills[o.mediaId];
        if (!url) return null;
        const from = Math.round((o.startMs / 1000) * fps);
        return (
          <Sequence key={o.id} from={from} durationInFrames={Math.max(1, Math.round((o.endMs / 1000) * fps) - from)}>
            <BrollStill o={o} src={url} fps={fps} />
          </Sequence>
        );
      })}
      <Captions chunks={tl.captions} pos={captionCss(doc, doc.aspect)} />
      {watermark && (
        <div style={{ position: "absolute", right: "4%", bottom: "3%", color: "rgba(255,255,255,.85)", fontFamily, fontWeight: 500, fontSize: 34, textShadow: "0 1px 2px rgba(0,0,0,.4)" }}>
          eyecandid
        </div>
      )}
    </AbsoluteFill>
  );
}

/** One kept range of the clip, framed for the output aspect (face-centred when the doc has a reframe track). */
function Shot({ seg, doc, src, W, H, fps }: { seg: Segment; doc: EditDoc; src: string; W: number; H: number; fps: number }) {
  const frame = useCurrentFrame();
  const clip = doc.clips.find((c) => c.id === seg.clipId);
  if (!clip) return null;
  const box = coverBox(clip.w, clip.h, W, H, faceAt(doc.reframe[clip.id], seg.fromMs + (frame / fps) * 1000));
  return (
    <Video
      src={src}
      trimBefore={Math.round((seg.fromMs / 1000) * fps)}
      style={{ position: "absolute", left: box.left, top: box.top, width: box.width, height: box.height }}
    />
  );
}

/** A generated still over its bead: cover-cropped, a slow Ken Burns push, a short fade (same as Cut's BrollStill). */
function BrollStill({ o, src, fps }: { o: BrollOverlay; src: string; fps: number }) {
  const frame = useCurrentFrame();
  const { scale, opacity } = kenBurnsAt(o, o.startMs + (frame / fps) * 1000);
  return (
    <AbsoluteFill style={{ opacity, overflow: "hidden" }}>
      {/* crossOrigin: the canvas this is drawn into must stay readable for the encoder */}
      <Img src={src} crossOrigin="anonymous" style={{ width: "100%", height: "100%", objectFit: "cover", transform: `scale(${scale})` }} />
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
  const scale = width / 390;
  return (
    <div style={{ position: "absolute", left: "6%", right: "6%", ...pos, textAlign: "center" }}>
      <span style={{ fontFamily, fontWeight: 700, fontSize: 22 * scale, lineHeight: `${26 * scale}px`, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,.45), 0 2px 12px rgba(0,0,0,.35)" }}>
        {c.text}
      </span>
    </div>
  );
}
