import * as React from 'react';
/**
 * Pill button. Primary = ink, secondary = glass (over footage), quiet = text. Min 44px.
 * @startingPoint section="Core" subtitle="Primary ink · secondary glass · quiet" viewport="700x260"
 */
export interface ButtonProps {
  variant?: 'primary' | 'secondary' | 'quiet';
  /** md = 44px, lg = 52px. Nothing smaller. */
  size?: 'md' | 'lg';
  /** Icon name from the Icon set, before the label. */
  icon?: string;
  iconAfter?: string;
  disabled?: boolean;
  /** Lowercase in product UI ("keep", "try again"). Omit for icon-only (then pass title). */
  children?: React.ReactNode;
  title?: string;
  type?: 'button' | 'submit';
  onClick?: (e: React.MouseEvent) => void;
  style?: React.CSSProperties;
}
export declare function Button(props: ButtonProps): JSX.Element;
