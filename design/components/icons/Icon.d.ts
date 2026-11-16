/** 20px line icon, 1.5px rounded stroke, never filled. Lucide path data. */
export interface IconProps {
  /** mic, paperclip, download, plus, x, check, chevron-right, chevron-left, scissors, play, pause, volume-2, music, film, image, rotate-ccw, eye, eye-off, crop, layers, captions, maximize-2, arrow-up, sparkles, copy, trash-2, audio-lines, type, undo-2, ellipsis, search, sun, moon, sliders-horizontal, wand */
  name: string;
  /** px. 20 default; 16 inside menus. */
  size?: number;
  className?: string;
  style?: React.CSSProperties;
  /** Accessible label; omit for decorative icons. */
  title?: string;
}
export declare function Icon(props: IconProps): JSX.Element;
export declare const ICON_NAMES: string[];
