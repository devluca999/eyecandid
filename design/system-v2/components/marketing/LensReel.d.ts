import * as React from 'react';
/**
 * A reel of finished 9:16 edits; hovering a Lens shows the raw before.
 */
export interface LensReelProps {
  title?: React.ReactNode;
  items?: Array<{ scene?: string; image?: string; caption: string; shape?: 'card' | 'edit' | 'circle' }>;
  width?: number;
  style?: React.CSSProperties;
}
export declare function LensReel(props: LensReelProps): JSX.Element;
