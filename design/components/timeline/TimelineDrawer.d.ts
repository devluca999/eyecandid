import { WeaveWindow } from '../weave/WeaveTrack';
/**
 * Glass timeline drawer — video / b-roll (Weave) / voice / music / captions. ⌥T or hover the bottom edge.
 * @startingPoint section="Video" subtitle="Timeline drawer with Weave and density dial" viewport="900x340"
 */
export interface TimelineDrawerProps {
  /** Positions are 0–1 of the duration. */
  clips?: Array<{ start: number; end: number; scene: string; name?: string }>;
  windows?: WeaveWindow[];
  /** Hook and CTA ranges that stay on the speaker. */
  onFace?: Array<{ start: number; end: number }>;
  captions?: Array<{ at: number; text: string }>;
  /** Weave density 0 (sparse) – 1 (fast-paced). */
  density?: number;
  onDensity?: (v: number) => void;
  playhead?: number;
  timecode?: string;
  duration?: string;
  /** Talking ranges (0–1) for the voice waveform. */
  talk?: Array<[number, number]>;
  style?: React.CSSProperties;
}
export declare const TRACKS: string[];
export declare function TimelineDrawer(props: TimelineDrawerProps): JSX.Element;
