import * as React from 'react';

/**
 * The video window. Chrome-edged, lens-shadowed, casts its scene's colour onto the paper.
 * @startingPoint section="Video" subtitle="Lens — theater circle, editing rect, storyboard card" viewport="700x420"
 */
export interface LensProps {
  /** circle = theater, rect = editing (true aspect, radius 20), card = storyboard 9:16 (radius 14). */
  shape?: 'circle' | 'rect' | 'card';
  state?: 'rest' | 'hover' | 'selected' | 'generating';
  /** CSS aspect-ratio for shape="rect": "9 / 16", "4 / 5", "1 / 1", "16 / 9", "1.85 / 1", "2.39 / 1". */
  aspect?: string;
  /** Width in px or CSS length. Defaults: circle 280, rect 480, card 180. */
  width?: number | string;
  /** Footage scene (see Footage). Also sets the ambient glow. */
  scene?: 'bed' | 'nightstand' | 'gym' | 'case' | 'sofa' | 'booth' | 'void';
  /** Real still or clip URL. */
  image?: string;
  grade?: string;
  /** Burned-in caption. For editable captions use CaptionEditor as a child. */
  caption?: string;
  /** Mono timecode shown on hover/selection. */
  timecode?: string;
  /** Extra node top-right on hover, e.g. a StatusDot. */
  meta?: React.ReactNode;
  /** 0–1. Draws the export progress ring along the Lens edge. */
  progress?: number;
  /** Recede behind a selection (blur 12px, opacity .4). */
  receded?: boolean;
  /** Apply hover lift on real :hover. */
  interactive?: boolean;
  /** Ambient light cast onto the paper. Default true. */
  glow?: boolean;
  onClick?: React.MouseEventHandler<HTMLDivElement>;
  onContextMenu?: React.MouseEventHandler<HTMLDivElement>;
  style?: React.CSSProperties;
  /** Overlays: SelectionOverlay, CaptionEditor, ExportPill… */
  children?: React.ReactNode;
}
export declare function Lens(props: LensProps): JSX.Element;
