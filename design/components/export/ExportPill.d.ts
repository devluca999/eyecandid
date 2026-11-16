/**
 * Inline export pill that appears on Lens hover: ratio, cutdowns, download. Progress traces the Lens edge.
 * @startingPoint section="Controls" subtitle="Export pill — ratios, cutdowns, ring, copied link" viewport="700x360"
 */
export interface ExportPillProps {
  ratios?: string[];
  value?: string;
  onChange?: (ratio: string) => void;
  /** Cutdown lengths in seconds. Pass [] to hide. */
  cutdowns?: string[];
  cut?: string | null;
  onCut?: (c: string | null) => void;
  onExport?: () => void;
  /** idle → rendering (dot + %) → done ("copied link · download"). */
  phase?: 'idle' | 'rendering' | 'done';
  progress?: number;
  onDownload?: () => void;
  style?: React.CSSProperties;
}
export declare function ExportPill(props: ExportPillProps): JSX.Element;
