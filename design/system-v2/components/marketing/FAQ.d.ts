import * as React from 'react';
/**
 * Accordion FAQ divided by hairlines; one open at a time, plus rotates to ×.
 */
export interface FAQProps {
  items?: Array<{ q: string; a: string }>;
  title?: string;
  style?: React.CSSProperties;
}
export declare function FAQ(props: FAQProps): JSX.Element;
