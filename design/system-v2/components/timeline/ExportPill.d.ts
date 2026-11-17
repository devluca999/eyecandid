import * as React from 'react';
/**
 * Floating glass export pill. While exporting, pair it with <Lens progress={n}> so the ring runs along the Lens edge.
 */
export interface ExportPillProps {
  state?: 'idle' | 'exporting' | 'done';
  /** 0–100 */
  progress?: number;
  /** Mono format line, e.g. "9:16 · 1080p". */
  format?: string;
  onExport?: () => void;
  onShare?: () => void;
  style?: React.CSSProperties;
}
export declare function ExportPill(props: ExportPillProps): JSX.Element;
