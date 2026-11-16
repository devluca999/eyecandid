export interface ContextMenuItem {
  label?: string;
  /** Icon name (16px in menus). */
  icon?: string;
  /** Ratio id — renders a tiny outline glyph: 'circle' | '9:16' | '4:5' | '1:1' | '16:9' | '1.85' | '2.39'. */
  ratio?: string;
  /** Right-aligned meta: a shortcut, a count or a descriptor ("reels"). */
  hint?: string;
  checked?: boolean;
  submenu?: ContextMenuItem[];
  separator?: boolean;
  /** Small group heading inside a submenu, e.g. "my styles". */
  heading?: string;
  /** Payload returned to onSelect. */
  value?: string;
}

/**
 * Right-click glass menu with submenus.
 * @startingPoint section="Controls" subtitle="Context menu — aspect ratio, style, edit with ai, takes, export" viewport="700x420"
 */
export interface ContextMenuProps {
  items: ContextMenuItem[];
  /** Label of the submenu to show open initially. */
  openSubmenu?: string;
  onSelect?: (item: ContextMenuItem) => void;
  style?: React.CSSProperties;
}
export declare const RATIOS: Array<{ id: string; label: string; hint?: string; box: [number, number]; circle?: boolean }>;
export declare function ContextMenu(props: ContextMenuProps): JSX.Element;
export declare function RatioGlyph(props: { ratio?: string; box?: [number, number]; circle?: boolean }): JSX.Element;
/** The standard Lens right-click menu. */
export declare function lensMenu(opts?: { ratio?: string; takes?: number }): ContextMenuItem[];
