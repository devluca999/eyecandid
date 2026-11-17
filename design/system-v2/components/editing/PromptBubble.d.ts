import * as React from 'react';
/**
 * Select-and-talk: a glass bubble anchored to whatever is selected. Type or speak a change; Eyecandid replies in one line.
 * @startingPoint section="Editing" subtitle="Select-and-talk bubble over footage" viewport="700x340"
 */
export interface PromptBubbleProps {
  /** What is selected, e.g. "selected · 0:04–0:09". */
  context?: React.ReactNode;
  placeholder?: string;
  /** Lowercase one-tap chips, e.g. ["tighter", "funnier", "cut the ums"]. */
  suggestions?: string[];
  value?: string;
  onChange?: (v: string) => void;
  onSubmit?: (v: string) => void;
  /** Voice input state. */
  listening?: boolean;
  /** One-line explanation of what Eyecandid just did. */
  reply?: React.ReactNode;
  /** Pointer toward the selection. */
  tail?: 'bottom' | 'top' | 'none';
  width?: number;
  style?: React.CSSProperties;
}
export declare function PromptBubble(props: PromptBubbleProps): JSX.Element;
