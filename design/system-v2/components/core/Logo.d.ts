import * as React from 'react';
/** Eyecandid mark (+ optional lowercase Geist Medium wordmark). Uses the supplied SVGs only. */
export interface LogoProps {
  /** flagship on light; inverse on dark; small is used automatically below 48px. */
  variant?: 'flagship' | 'inverse' | 'small';
  height?: number;
  wordmark?: boolean;
  /** Path to the folder holding the eyecandid-mark*.svg files. Default "assets/". */
  basePath?: string;
  style?: React.CSSProperties;
}
export declare function Logo(props: LogoProps): JSX.Element;
