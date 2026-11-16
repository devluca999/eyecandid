/**
 * Structure templates as rows of ghost beat cards.
 * @startingPoint section="Screens" subtitle="Template rows — Problem/Demo/Proof/CTA and friends" viewport="700x380"
 */
export interface TemplateRowProps {
  /** Sentence case: "Problem / Demo / Proof / CTA". */
  name: string;
  /** Lowercase beat names. */
  beats: string[];
  onPick?: () => void;
  cardWidth?: number;
}
export declare const TEMPLATES: Array<{ name: string; beats: string[] }>;
export declare function TemplateRow(props: TemplateRowProps): JSX.Element;
