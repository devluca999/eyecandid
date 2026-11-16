export interface BeadWord { text: string; /** um, like, you know… shown faint + struck through */ filler?: boolean; restored?: boolean; }
export interface Bead {
  id?: string | number;
  scene: string;
  grade?: string;
  /** Seconds. Bead width = dur × pxPerSec. */
  dur: number;
  words?: BeadWord[];
}
export interface KeyMoment {
  bead: number;
  /** Position inside the bead, 0–1. */
  at?: number;
  /** hook · reveal · best line */
  label: string;
}
/**
 * Segments as beads on a hairline thread: split, trim, '+' between, AI key moments, fillers.
 * @startingPoint section="Video" subtitle="Bead thread — split, trim, moments, fillers" viewport="700x220"
 */
export interface BeadThreadProps {
  beads: Bead[];
  selected?: number;
  onSelect?: (i: number) => void;
  /** Edge drag. Minimum 0.6s. */
  onTrim?: (i: number, dur: number) => void;
  moments?: KeyMoment[];
  /** Label of the moment being looped. */
  looping?: string;
  onMoment?: (m: KeyMoment) => void;
  /** Hide beads without a key moment. */
  momentsOnly?: boolean;
  /** '+' clicked in the gap before bead i. */
  onAdd?: (i: number) => void;
  onRestore?: (bead: number, word: number) => void;
  /** Seconds. */
  playhead?: number;
  pxPerSec?: number;
  style?: React.CSSProperties;
}
export declare function BeadThread(props: BeadThreadProps): JSX.Element;
