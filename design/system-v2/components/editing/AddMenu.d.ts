import * as React from 'react';
/**
 * The single "+" on the canvas. Opens a glass grid: b-roll, voiceover, music, captions, text, ai shot.
 */
export interface AddMenuProps {
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  onPick?: (id: 'broll' | 'voice' | 'music' | 'captions' | 'text' | 'shot' | string) => void;
  items?: Array<{ id: string; icon: string; label: string; hint: string }>;
  style?: React.CSSProperties;
}
export declare function AddMenu(props: AddMenuProps): JSX.Element;
