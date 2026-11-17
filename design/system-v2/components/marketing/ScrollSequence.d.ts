import * as React from 'react';
export declare const SEQUENCE_STEPS: any[];
/**
 * Scroll-driven sequence frame: a sticky Lens morphs through film → trim → caption → cinema while copy changes; last step flips to Night.
 */
export interface ScrollSequenceProps {
  /** Force a step (0-based) and render un-sticky — for previews. */
  step?: number;
  steps?: Array<{ title: string; body: string; lens: object; beads?: boolean; night?: boolean }>;
  scene?: string;
  /** Total scroll length of the section. */
  height?: string;
  style?: React.CSSProperties;
}
export declare function ScrollSequence(props: ScrollSequenceProps): JSX.Element;
