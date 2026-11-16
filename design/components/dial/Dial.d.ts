/**
 * Rotary dial for whole-edit controls that re-edit live: pace, b-roll density, energy.
 * @startingPoint section="Controls" subtitle="Dials — pace, b-roll, energy" viewport="700x200"
 */
export interface DialProps {
  /** One lowercase word: "pace", "b-roll", "energy". */
  label: string;
  /** 0–1. */
  value?: number;
  onChange?: (v: number) => void;
  /** Word shown below 0.34, e.g. "sparse". */
  low?: string;
  /** Word shown above 0.66, e.g. "fast-paced". */
  high?: string;
  format?: (v: number) => string;
  /** Knob diameter in px. Default 44 (the minimum hit target). */
  size?: number;
}
export declare function Dial(props: DialProps): JSX.Element;
