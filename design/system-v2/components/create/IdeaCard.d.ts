import * as React from 'react';
/**
 * A 9:16 storyboard card pitching one video idea: hook on the footage, beats + one-line why, and "film this" (opens the teleprompter).
 */
export interface IdeaCardProps {
  hook?: string;
  beats?: number;
  length?: string;
  /** Why this idea, one line, lowercase. */
  why?: string;
  scene?: string;
  image?: string;
  width?: number;
  onFilm?: () => void;
  style?: React.CSSProperties;
}
export declare function IdeaCard(props: IdeaCardProps): JSX.Element;
