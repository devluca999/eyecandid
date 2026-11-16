export interface BrollResult {
  scene: string;
  grade?: string;
  /** library = your footage, stock = licensed, generate = made on demand (shimmers until ready). */
  source: 'library' | 'stock' | 'generate';
  /** e.g. "0:04" */
  dur?: string;
}
/**
 * B-roll search sheet: plain-language query, looping result carousel, drag to insert.
 * @startingPoint section="Video" subtitle="B-roll sheet — search, loop, drag onto the thread" viewport="700x400"
 */
export interface BrollSheetProps {
  query?: string;
  onQuery?: (q: string) => void;
  results: BrollResult[];
  onInsert?: (r: BrollResult) => void;
  onClose?: () => void;
  style?: React.CSSProperties;
}
export declare function BrollSheet(props: BrollSheetProps): JSX.Element;
