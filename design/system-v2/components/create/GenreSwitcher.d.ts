import * as React from 'react';
export declare const GENRES: Array<{ id: string; why: string }>;
/**
 * Six small circle Lenses previewing the same footage in each genre grade. Picking one re-cuts the edit and says what changed.
 */
export interface GenreSwitcherProps {
  value?: 'comedy' | 'horror' | 'thriller' | 'action' | 'romance' | 'documentary';
  onChange?: (id: string) => void;
  scene?: string;
  image?: string;
  /** Lens diameter. */
  size?: number;
  style?: React.CSSProperties;
}
export declare function GenreSwitcher(props: GenreSwitcherProps): JSX.Element;
