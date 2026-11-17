import * as React from 'react';
/**
 * Earnest first-person founder note on bare paper — the one place marketing drops the jokes. Default copy is PLACEHOLDER (labelled in the UI); founder is Luca, signature left as "[founder name]" until he supplies it.
 */
export interface FounderLetterProps {
  greeting?: string;
  /** Paragraphs; the first renders larger. */
  body?: string[];
  name?: string;
  role?: string;
  scene?: string;
  image?: string;
  style?: React.CSSProperties;
}
export declare function FounderLetter(props: FounderLetterProps): JSX.Element;
