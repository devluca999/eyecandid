import * as React from 'react';
/**
 * Quiet landing footer: lockup + tagline, three lowercase link columns, one hairline.
 */
export interface FooterProps {
  assetBase?: string;
  cols?: Array<{ t: string; l: string[] }>;
  style?: React.CSSProperties;
}
export declare function Footer(props: FooterProps): JSX.Element;
