import * as React from 'react';
/**
 * Fanned stack of 9:16 takes of the same line; the best take sits on top with a one-line reason. keep / try again.
 */
export interface TakeStackProps {
  takes?: Array<{ scene?: string; image?: string; grade?: string; note: string; best?: boolean }>;
  index?: number;
  onChange?: (i: number) => void;
  onKeep?: (i: number) => void;
  onRetry?: (i: number) => void;
  /** Card width; height is 16/9 of it. */
  width?: number;
  style?: React.CSSProperties;
}
export declare function TakeStack(props: TakeStackProps): JSX.Element;
