import * as React from 'react';
export type FootageScene = 'morning-sheets' | 'walnut-lamp' | 'gym-dumbbell' | 'rose-case' | 'creator-portrait';
export type FootageGrade = 'none' | 'comedy' | 'horror' | 'thriller' | 'action' | 'romance' | 'documentary';
/** Photographic-feeling footage fill. Absolutely fills its positioned parent. */
export interface FootageProps {
  /** Built-in scene. Ignored when `image` is set. */
  scene?: FootageScene;
  /** URL of a real still — always preferred over a scene when you have one. */
  image?: string;
  /** Colour grade (used by GenreSwitcher). */
  grade?: FootageGrade;
  /** Slow handheld drift, to read as live video. */
  playing?: boolean;
  alt?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
export declare const FOOTAGE_SCENES: Record<FootageScene, { glow: string; label: string }>;
export declare function Footage(props: FootageProps): JSX.Element;
