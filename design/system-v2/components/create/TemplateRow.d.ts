import * as React from 'react';
/**
 * A titled horizontal row of 9:16 template cards, each naming its beats ("hook · demo · cta").
 */
export interface TemplateRowProps {
  title?: string;
  templates?: Array<{ name: string; beats: string; scene?: string; image?: string }>;
  cardWidth?: number;
  onPick?: (name: string) => void;
  onSeeAll?: () => void;
  style?: React.CSSProperties;
}
export declare function TemplateRow(props: TemplateRowProps): JSX.Element;
