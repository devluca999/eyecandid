import * as React from 'react';
/**
 * One timeline track threaded on a hairline. Every track has an autopilot; the label only changes when there is an exception to check.
 */
export interface WeaveTrackProps {
  kind?: 'video' | 'broll' | 'voice' | 'music' | 'captions';
  /** Seconds. For music, clips with duck:true mark where it ducks under the voice. */
  clips?: Array<{ start: number; dur: number; scene?: string; image?: string; text?: string; reason?: string; duck?: boolean; selected?: boolean; attention?: boolean }>;
  duration?: number;
  auto?: boolean;
  /** Count of decisions autopilot wants the user to check. */
  exceptions?: number;
  note?: string;
  /** Seconds. */
  playhead?: number;
  labelWidth?: number;
  onToggleAuto?: () => void;
  style?: React.CSSProperties;
}
export declare function WeaveTrack(props: WeaveTrackProps): JSX.Element;
