import * as React from 'react';
/** Line icon from the Lucide set (copied into assets/icons). 1.5px stroke on a 20px grid, rounded caps, never filled. */
export interface IconProps {
  /** Lucide icon name, e.g. "scissors", "captions", "mic". See ICON_NAMES. */
  name: string;
  /** Default 20. */
  size?: number;
  /** Visual stroke in px at 20px. Default 1.5. */
  strokeWidth?: number;
  color?: string;
  title?: string;
  style?: React.CSSProperties;
}
export declare const ICON_NAMES: string[];
export declare function Icon(props: IconProps): JSX.Element;
