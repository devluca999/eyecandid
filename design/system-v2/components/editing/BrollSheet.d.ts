import * as React from 'react';
/**
 * Glass sheet of b-roll suggestions, each matched to something the speaker said and explained in one line.
 */
export interface BrollSheetProps {
  query?: string;
  items?: Array<{ scene?: string; image?: string; reason: string; at?: string }>;
  selected?: number;
  onPick?: (i: number) => void;
  onClose?: () => void;
  /** glass when floating over footage; paper (solid canvas + hairline) when it sits on the canvas, e.g. the web editor. */
  material?: 'glass' | 'paper';
  style?: React.CSSProperties;
}
export declare function BrollSheet(props: BrollSheetProps): JSX.Element;
