import * as React from 'react';
import { FootageScene, FootageGrade } from './Footage';
/**
 * The core object: one video window that morphs between theater circle, edit rectangle and 9:16 storyboard card.
 * @startingPoint section="Core" subtitle="The Lens — circle, edit, card" viewport="700x420"
 */
export interface LensProps {
  /** circle = theater · edit = true aspect ratio, radius 20 · card = 9:16 storyboard. Changing it springs (~450ms). */
  shape?: 'circle' | 'edit' | 'card';
  /** Aspect for shape="edit", e.g. "16:9", "9:16", "1:1", "4:5". */
  aspect?: string;
  state?: 'rest' | 'hover' | 'selected' | 'generating';
  scene?: FootageScene;
  image?: string;
  grade?: FootageGrade;
  /** Width in px; height derives from shape/aspect. */
  width?: number;
  /** Ambient footage-coloured glow on the paper. */
  glow?: boolean;
  playing?: boolean;
  /** 0–100; draws the export progress ring on the Lens edge. */
  progress?: number;
  /** Mono timecode, revealed on hover. */
  timecode?: string;
  /** Lowercase chip label, revealed on hover. */
  label?: string;
  /** Burned-in caption preview. */
  caption?: React.ReactNode;
  onClick?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
  children?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function Lens(props: LensProps): JSX.Element;
