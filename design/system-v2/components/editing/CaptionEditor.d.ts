import * as React from 'react';
/**
 * Edit burned-in captions word by word, directly on top of the footage. Click a word to fix it.
 */
export interface CaptionEditorProps {
  words?: string[];
  /** Word currently being spoken (selected). */
  active?: number;
  /** Indexes rendered heavier in the burn-in. */
  emphasis?: number[];
  scene?: string;
  width?: number;
  captionStyle?: 'clean' | 'karaoke';
  onChange?: (words: string[]) => void;
  /** One-line explanation of automatic fixes. */
  note?: React.ReactNode;
  style?: React.CSSProperties;
}
export declare function CaptionEditor(props: CaptionEditorProps): JSX.Element;
