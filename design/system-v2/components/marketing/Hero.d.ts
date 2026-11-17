import * as React from 'react';
/**
 * Landing hero: nav, playful display headline, live DropZone, and one Lens morphing raw → working → edit → theater.
 * @startingPoint section="Marketing" subtitle="Hero with live drop zone and morphing Lens" viewport="1280x640"
 */
export interface HeroProps {
  kicker?: string;
  headline?: React.ReactNode;
  sub?: React.ReactNode;
  /** Folder with the logo SVGs, relative to the page. */
  assetBase?: string;
  scene?: string;
  onFiles?: (files: File[]) => void;
  onCta?: () => void;
  nav?: boolean;
  style?: React.CSSProperties;
}
export declare function Hero(props: HeroProps): JSX.Element;
