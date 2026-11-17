import * as React from 'react';
/**
 * The edit as a thread of beads: footage segments sized by duration, key-moment ticks, and struck-through fillers the autopilot removed.
 */
export interface BeadThreadProps {
  /** clip = footage bead · filler = removed word (struck through) · pause = removed silence dot. */
  segments?: Array<{ kind: 'clip' | 'filler' | 'pause'; dur: number; scene?: string; image?: string; label?: string; key?: string }>;
  /** 0–1 */
  playhead?: number;
  selected?: number;
  onSelect?: (index: number) => void;
  /** One-line explanation of the automatic cuts. */
  explain?: React.ReactNode;
  width?: number;
  style?: React.CSSProperties;
}
export declare function BeadThread(props: BeadThreadProps): JSX.Element;
