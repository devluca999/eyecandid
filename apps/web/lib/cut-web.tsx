"use client";
import { AbsoluteFill, Img, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import { Audio, Video } from "@remotion/media";
import { loadFont } from "@remotion/google-fonts/Geist";
import { brollOverlays, coverBox, faceAt, framesOf, kenBurnsAt, punchAt, toTimeline, type BrollOverlay, type EditDoc, type Segment, type SoundPiece } from "@eyelore/core";

const { fontFamily } = loadFont("normal", { weights: ["500", "700"], subsets: ["latin"] });

/**
 * `stills`: signed URLs of the doc's generated b-roll stills, by mediaId (from authorizeDeviceExport); empty on Free.
 * `sound`: the edit's sound already mixed (a WAV URL from renderOnDevice: J/L cuts, sample-accurate fades, loudness).
 * Without it each sound piece plays from the clip with frame-level fades, at `gain`.
 */
export type CutWebProps = { doc: EditDoc; src: string; watermark: boolean; stills?: Record<string, string>; sound?: string; gain?: number };

/**
 * The browser twin of services/render/src/Cut.tsx for @remotion/web-renderer: same timeline maths
 * (toTimeline and brollOverlays from core), <Video> from @remotion/media instead of <OffthreadVideo>, Geist via google-fonts.
 * Picture and sound are separate tracks (J/L cuts); the picture follows the energy dial's punch-ins like the preview.
 */
export function CutWeb({ doc, src, watermark, stills = {}, sound, gain = 1 }: CutWebProps) {
  const { fps, width: W, height: H } = useVideoConfig();
  const tl = toTimeline(doc);
  const broll = brollOverlays(doc, tl.segments);
  return (
    <AbsoluteFill style={{ backgroundColor: "#0F0F10", overflow: "hidden" }}>
      {tl.picture.map((p, i) => {
        const f = framesOf(p, fps);
        if (f.frames <= 0) return null;
        return (
          <Sequence key={`v${i}`} from={f.from} durationInFrames={f.frames}>
            <Shot seg={p} doc={doc} src={src} W={W} H={H} fps={fps} />
          </Sequence>
        );
      })}
      {sound ? (
        <Audio src={sound} />
      ) : (
        tl.sound.map((p, i) => {
          const f = framesOf(p, fps);
          if (f.frames <= 0) return null;
          return (
            <Sequence key={`a${i}`} from={f.from} durationInFrames={f.frames}>
              <Audio src={src} trimBefore={f.trimBefore} volume={(fr: number) => gain * edgeVolume(p, fr, f.frames)} />
            </Sequence>
          );
        })
      )}
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
      <Captions chunks={tl.captions} />
      {watermark && (
        <div style={{ position: "absolute", right: "4%", bottom: "3%", color: "rgba(255,255,255,.85)", fontFamily, fontWeight: 500, fontSize: 34, textShadow: "0 1px 2px rgba(0,0,0,.4)" }}>
          eyecandid
        </div>
      )}
    </AbsoluteFill>
  );
}

/** Frame-level fades (fallback only, see Cut.tsx soundVolume): silent on the first and last frame of a faded piece. */
function edgeVolume(p: SoundPiece, frame: number, frames: number): number {
  if (frames < 4) return 1;
  if (p.fadeInMs > 0 && frame === 0) return 0;
  if (p.fadeOutMs > 0 && frame === frames - 1) return 0;
  return 1;
}

/** One kept range of the clip, framed for the output aspect (face-centred, pushed in by the energy dial's punch-ins). */
function Shot({ seg, doc, src, W, H, fps }: { seg: Segment; doc: EditDoc; src: string; W: number; H: number; fps: number }) {
  const frame = useCurrentFrame();
  const clip = doc.clips.find((c) => c.id === seg.clipId);
  if (!clip) return null;
  const srcMs = seg.fromMs + (frame / fps) * 1000;
  const face = faceAt(doc.reframe[clip.id], srcMs);
  const box = coverBox(clip.w, clip.h, W, H, { ...face, scale: face.scale * punchAt(doc, clip.id, srcMs) });
  return (
    <Video
      src={src}
      muted
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

function Captions({ chunks }: { chunks: ReturnType<typeof toTimeline>["captions"] }) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const c = chunks.find((x) => ms >= x.startMs && ms < x.endMs);
  if (!c) return null;
  const scale = width / 390;
  return (
    <div style={{ position: "absolute", left: "6%", right: "6%", top: "64%", textAlign: "center" }}>
      <span style={{ fontFamily, fontWeight: 700, fontSize: 22 * scale, lineHeight: `${26 * scale}px`, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,.45), 0 2px 12px rgba(0,0,0,.35)" }}>
        {c.text}
      </span>
    </div>
  );
}
