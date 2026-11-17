import * as React from 'react';
/**
 * Keyboard shortcut overlay (press ?). Glass, three columns, mono key chips.
 */
export interface ShortcutSheetProps {
  groups?: Array<{ title: string; rows: Array<[string, string[]]> }>;
  style?: React.CSSProperties;
}
export declare function ShortcutSheet(props: ShortcutSheetProps): JSX.Element;
