import * as React from 'react';
/**
 * Social-proof slot. Until real, consented creator proof exists it renders a clearly labelled PLACEHOLDER strip — never fake quotes, metrics or handles.
 */
export interface MarqueeProps {
  label?: string;
  style?: React.CSSProperties;
}
export declare function Marquee(props: MarqueeProps): JSX.Element;
