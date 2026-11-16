/**
 * A style recipe as a looping mini-Lens. Used in the style carousel; "My styles" sit at the front.
 * @startingPoint section="Video" subtitle="Style cards — looping recipe lenses, my styles first" viewport="700x340"
 */
export interface StyleCardProps {
  /** Sentence case: "Punch-in zoom". */
  name: string;
  /** "instant", "generates new shots", "my style". */
  tag?: string;
  scene?: string;
  grade?: string;
  /** Loop that demonstrates the recipe. */
  anim?: 'punch' | 'whip' | 'ramp' | 'crash' | 'jump' | 'drift';
  selected?: boolean;
  onClick?: () => void;
}
export declare function StyleCard(props: StyleCardProps): JSX.Element;
