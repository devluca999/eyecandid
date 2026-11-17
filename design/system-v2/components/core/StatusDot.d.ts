import * as React from 'react';
/** Status: a 6px dot plus at most one lowercase word. Never a badge. */
export interface StatusDotProps {
  status?: 'ready' | 'working' | 'attention';
  /** Defaults to the status word. Pass null for dot only. */
  label?: React.ReactNode | null;
  style?: React.CSSProperties;
}
export declare function StatusDot(props: StatusDotProps): JSX.Element;
