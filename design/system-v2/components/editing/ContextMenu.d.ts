import * as React from 'react';
export declare const ASPECTS: Array<{ id: string; label: string; w: number; h: number }>;
export declare function AspectGlyph(props: { w: number; h: number; size?: number; active?: boolean }): JSX.Element;
/**
 * Right-click menu on a Lens or bead. Glass, lowercase, with an Aspect ratio submenu of proportional glyphs.
 * @startingPoint section="Editing" subtitle="Right-click menu with aspect submenu" viewport="700x360"
 */
export interface ContextMenuProps {
  /** Menu rows. Omit for the default Lens menu. */
  items?: Array<{ id?: string; icon?: string; label?: string; shortcut?: string; submenu?: 'aspect'; separator?: boolean }>;
  /** Current aspect (checked in the submenu). */
  aspect?: '9:16' | '4:5' | '1:1' | '16:9' | '2.39:1' | string;
  /** Force a submenu open (for previews). */
  openSubmenu?: 'aspect' | null;
  onSelect?: (id: string) => void;
  onAspect?: (id: string) => void;
  style?: React.CSSProperties;
}
export declare function ContextMenu(props: ContextMenuProps): JSX.Element;
