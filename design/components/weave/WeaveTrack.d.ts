export interface WeaveWindow {
  start: number; end: number;
  /** "cut away · you said 'nightstand'" — action · reason. */
  why?: string;
  /** Pinned windows survive re-weaves. */
  pinned?: boolean;
}
export interface WeaveCue { at: number; score: number; why: string; pinned?: boolean; }
/**
 * The b-roll track with Weave: raw b-roll as a faint ribbon, lit windows where it plays, hover reasons, on-face brackets.
 * @startingPoint section="Video" subtitle="Weave track — lit b-roll windows with reasons" viewport="700x220"
 */
export interface WeaveTrackProps {
  windows: WeaveWindow[];
  /** Scenes in the raw b-roll, used to paint the ribbon. */
  scenes?: string[];
  /** Ranges that must stay on the speaker's face (hook, CTA). */
  onFace?: Array<{ start: number; end: number }>;
  onWindowClick?: (index: number) => void;
  height?: number;
}
export declare function WeaveTrack(props: WeaveTrackProps): JSX.Element;
/** Derive windows from cues for a density 0 (sparse) – 1 (fast-paced). */
export declare function weave(cues: WeaveCue[], density: number): WeaveWindow[];
