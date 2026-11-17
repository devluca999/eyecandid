import * as React from 'react';
/**
 * Chrome-rimmed rotary dial for one continuous quality of the edit (pace, energy, music level). Drag vertically, scroll or use arrows.
 */
export interface DialProps {
  value?: number;
  defaultValue?: number;
  onChange?: (v: number) => void;
  label?: string;
  minLabel?: string;
  maxLabel?: string;
  size?: number;
  /** Map value → one lowercase word. */
  describe?: (v: number) => string;
  style?: React.CSSProperties;
}
export declare function Dial(props: DialProps): JSX.Element;
