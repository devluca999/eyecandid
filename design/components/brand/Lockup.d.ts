/**
 * Eyelore lockup: exact mark + lowercase Geist Medium wordmark.
 * @startingPoint section="Brand" subtitle="Lockup — mark + wordmark at any size" viewport="700x200"
 */
export interface LockupProps {
  /** Mark height in px. Below 32 the small cut is used automatically (it is below 48px wide). */
  height?: number;
  theme?: 'paper' | 'night';
  /** false = mark only. */
  wordmark?: boolean;
  /** Path prefix to the design-system root, e.g. "../../". */
  base?: string;
  style?: React.CSSProperties;
}
export declare function Lockup(props: LockupProps): JSX.Element;
