import * as React from 'react';
/** Frosted glass panel — only for things that float over footage. */
export interface GlassProps extends React.HTMLAttributes<HTMLElement> {
  /** 16 for panels, 999 for pills. */
  radius?: number;
  padding?: number | string;
  as?: string;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Glass(props: GlassProps): JSX.Element;
