/**
 * Empty-state idea engine answers: hook critique, sharper angles, risk flags; ghost beat cards.
 * @startingPoint section="Screens" subtitle="Idea card + ghost beats — the empty state" viewport="700x360"
 */
export interface IdeaCardProps {
  /** Meta line above, e.g. "angle 2 · objection first". */
  kicker?: string;
  /** The idea itself, one or two sentences. */
  line: string;
  /** Why it works, one line. */
  why?: string;
  onClick?: () => void;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
export declare function IdeaCard(props: IdeaCardProps): JSX.Element;
export interface GhostCardProps { label: string; width?: number; style?: React.CSSProperties; }
export declare function GhostCard(props: GhostCardProps): JSX.Element;
