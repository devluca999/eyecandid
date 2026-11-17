import * as React from 'react';
export declare const DEFAULT_TRACKS: Record<string, any[]>;
/**
 * Glass drawer that slides up over the canvas with the five tracks in fixed order: video, b-roll, voice, music, captions. Hidden until asked for.
 * @startingPoint section="Editing" subtitle="Five-track timeline drawer, autopilot on" viewport="700x340"
 */
export interface TimelineDrawerProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  /** Clips per track. Order is fixed regardless of object key order. */
  tracks?: Partial<Record<'video' | 'broll' | 'voice' | 'music' | 'captions', any[]>>;
  /** Seconds. */
  duration?: number;
  playhead?: number;
  /** Exceptions per track kind, e.g. { broll: 1 }. */
  exceptions?: Partial<Record<string, number>>;
  /** glass over footage; paper (solid canvas + hairline) on the canvas, e.g. the web editor. */
  material?: 'glass' | 'paper';
  style?: React.CSSProperties;
}
export declare function TimelineDrawer(props: TimelineDrawerProps): JSX.Element;
