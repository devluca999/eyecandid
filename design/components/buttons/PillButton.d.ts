import * as React from 'react';

/**
 * Pill button. Min height 44px, lowercase label.
 * @startingPoint section="Controls" subtitle="Pill buttons — primary, secondary (glass), quiet" viewport="700x200"
 */
export interface PillButtonProps {
  /** primary = ink fill (one per view), secondary = glass (over video), quiet = text only. */
  variant?: 'primary' | 'secondary' | 'quiet';
  /** Icon name from the Eyelore set (see Icon). */
  icon?: string;
  iconRight?: string;
  /** Circular 44px icon-only button; requires `title`. */
  iconOnly?: boolean;
  disabled?: boolean;
  onClick?: React.MouseEventHandler<HTMLButtonElement>;
  type?: 'button' | 'submit';
  title?: string;
  style?: React.CSSProperties;
  children?: React.ReactNode;
}
export declare function PillButton(props: PillButtonProps): JSX.Element;
