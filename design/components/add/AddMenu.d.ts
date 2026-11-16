export interface AddItem { id: string; icon: string; label: string; }
/**
 * One-gesture insert between beads: voice, b-roll, grade, music, text.
 * @startingPoint section="Controls" subtitle="Add menu — the '+' between beads" viewport="700x260"
 */
export interface AddMenuProps {
  onPick?: (id: 'voice' | 'broll' | 'grade' | 'music' | 'text' | string) => void;
  items?: AddItem[];
  style?: React.CSSProperties;
}
export declare const ADD_ITEMS: AddItem[];
export declare function AddMenu(props: AddMenuProps): JSX.Element;

export interface GradeSwatchesProps {
  /** Scene of the current frame — every swatch is that frame in a look. */
  scene?: string;
  value?: string;
  onPick?: (look: string) => void;
  looks?: string[];
  onReference?: () => void;
}
export declare function GradeSwatches(props: GradeSwatchesProps): JSX.Element;
