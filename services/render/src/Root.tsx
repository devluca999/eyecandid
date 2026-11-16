import { Composition } from "remotion";
import { emptyEditDoc } from "@eyelore/core";
import { Cut, type CutProps } from "./Cut";
import { toTimeline } from "@eyelore/core";

const SIZES = { "9:16": [1080, 1920], "4:5": [1080, 1350], "1:1": [1080, 1080], "16:9": [1920, 1080] } as const;

export function Root() {
  return (
    <Composition
      id="Cut"
      component={Cut}
      fps={30}
      width={1080}
      height={1920}
      durationInFrames={30}
      defaultProps={{ doc: emptyEditDoc("preview"), media: {}, watermark: true } satisfies CutProps}
      calculateMetadata={({ props }) => {
        const [width, height] = SIZES[props.doc.aspect];
        return { width, height, durationInFrames: Math.max(30, Math.round((toTimeline(props.doc).durationMs / 1000) * 30)) };
      }}
    />
  );
}
