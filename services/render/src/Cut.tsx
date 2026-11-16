import { AbsoluteFill, OffthreadVideo, Sequence, useCurrentFrame, useVideoConfig } from "remotion";
import type { EditDoc } from "@eyelore/core";
import { toTimeline } from "./timeline";

export type CutProps = { doc: EditDoc; media: Record<string, string>; watermark: boolean };

/** Renders the edit model. Captions are the speaker's words exactly (22/26 bold white with soft shadow, scaled). */
export function Cut({ doc, media, watermark }: CutProps) {
  const { fps } = useVideoConfig();
  const tl = toTimeline(doc);
  let at = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: "#0F0F10" }}>
      {tl.segments.map((s, i) => {
        const frames = Math.max(1, Math.round(((s.toMs - s.fromMs) / 1000) * fps));
        const start = at;
        at += frames;
        const src = media[s.mediaId];
        return (
          <Sequence key={i} from={start} durationInFrames={frames}>
            {src ? <OffthreadVideo src={src} startFrom={Math.round((s.fromMs / 1000) * fps)} style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : null}
          </Sequence>
        );
      })}
      <Captions chunks={tl.captions} />
      {watermark && (
        <div style={{ position: "absolute", right: 40, bottom: 48, color: "rgba(255,255,255,.75)", font: "500 34px Geist, sans-serif" }}>eyelore</div>
      )}
    </AbsoluteFill>
  );
}

function Captions({ chunks }: { chunks: ReturnType<typeof toTimeline>["captions"] }) {
  const frame = useCurrentFrame();
  const { fps, width } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const c = chunks.find((x) => ms >= x.startMs && ms < x.endMs);
  if (!c) return null;
  const scale = width / 390; // design caption 22/26 at phone width
  return (
    <div style={{ position: "absolute", left: 60, right: 60, top: "64%", textAlign: "center" }}>
      <span style={{ font: `700 ${22 * scale}px/${26 * scale}px Geist, sans-serif`, color: "#fff", textShadow: "0 1px 2px rgba(0,0,0,.45), 0 2px 12px rgba(0,0,0,.35)" }}>{c.text}</span>
    </div>
  );
}
