import * as React from 'react';
/**
 * A caption/look style shown on real footage: clean, karaoke, loud, boxed, quiet. Selected = accent ring.
 */
export interface StyleCardProps {
  name?: string;
  kind?: 'clean' | 'karaoke' | 'loud' | 'boxed' | 'quiet';
  scene?: string;
  image?: string;
  width?: number;
  selected?: boolean;
  sample?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
}
export declare function StyleCard(props: StyleCardProps): JSX.Element;
