export interface Anchor { from: number; to: number; /** short pin label, e.g. "timer" */ label: string; effect: string; }
/**
 * Word-anchored effects: select words in the transcript, attach "a giant timer drops and rings", it pins to the words.
 * @startingPoint section="Video" subtitle="Effect anchor — effects pinned to spoken words" viewport="700x260"
 */
export interface EffectAnchorProps {
  words: string[];
  /** Index of the word being spoken. */
  now?: number;
  anchors?: Anchor[];
  /** [from, to] word indices. */
  selection?: [number, number] | null;
  onSelect?: (sel: [number, number]) => void;
  onAttach?: (sel: [number, number], effect: string) => void;
  suggestions?: string[];
  style?: React.CSSProperties;
}
export declare function EffectAnchor(props: EffectAnchorProps): JSX.Element;
