"use client";
import { useState, type CSSProperties } from "react";
import { Icon } from "./Icon";
import type { IconName } from "../icons.generated";

/** design/components/menu/ContextMenu: glass menu, ratio glyphs drawn at true proportion. */
export const RATIOS = [
  { id: "circle", label: "circle", hint: "theater", box: [14, 14] as const, circle: true },
  { id: "9:16", label: "9:16", hint: "reels", box: [9, 16] as const },
  { id: "4:5", label: "4:5", hint: "feed", box: [13, 16] as const },
  { id: "1:1", label: "1:1", box: [15, 15] as const },
  { id: "16:9", label: "16:9", hint: "youtube", box: [20, 11] as const },
];

export function RatioGlyph({ ratio }: { ratio: string }) {
  const r = RATIOS.find((x) => x.id === ratio);
  const [w, h] = r ? r.box : [14, 14];
  return (
    <span className={"el-ratio" + (r && "circle" in r ? " el-ratio--circle" : "")} aria-hidden="true">
      <span style={{ width: w, height: h }} />
    </span>
  );
}

export type MenuItem =
  | { separator: true }
  | { heading: string }
  | { label: string; value?: string; icon?: IconName; ratio?: string; hint?: string; checked?: boolean; submenu?: MenuItem[] };

function Item({ item, open, onOpen, onSelect }: { item: MenuItem; open: boolean; onOpen: (l: string | null) => void; onSelect: (i: MenuItem) => void }) {
  if ("separator" in item) return <div className="el-menu__sep" role="separator" />;
  if ("heading" in item) return <div className="el-menu__head">{item.heading}</div>;
  const hasSub = !!item.submenu;
  return (
    <div
      role="menuitem"
      tabIndex={-1}
      aria-haspopup={hasSub || undefined}
      className={"el-menu__item" + (open ? " is-open" : "") + (item.checked ? " is-checked" : "")}
      onMouseEnter={() => onOpen(hasSub ? item.label : null)}
      onClick={() => {
        if (hasSub) onOpen(item.label);
        else onSelect(item);
      }}
      onKeyDown={(e) => {
        if (e.key !== "Enter" && e.key !== " ") return;
        if (hasSub) onOpen(item.label);
        else onSelect(item);
      }}
    >
      {item.ratio ? <RatioGlyph ratio={item.ratio} /> : item.icon ? <Icon name={item.icon} size={16} /> : null}
      <span className="el-menu__label">{item.label}</span>
      {item.hint && <span className="el-menu__hint">{item.hint}</span>}
      {item.checked && <Icon name="check" size={14} />}
      {hasSub && <Icon name="chevron-right" size={14} />}
      {hasSub && open && (
        <div style={{ position: "absolute", left: "calc(100% + 8px)", top: -6, zIndex: 1 }}>
          <ContextMenu items={item.submenu!} onSelect={onSelect} />
        </div>
      )}
    </div>
  );
}

export function ContextMenu({ items, onSelect, style }: { items: MenuItem[]; onSelect: (i: MenuItem) => void; style?: CSSProperties }) {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="el-glass el-menu el-pop" role="menu" style={style}>
      {items.map((it, i) => (
        <Item key={i} item={it} open={"label" in it && open === it.label} onOpen={setOpen} onSelect={onSelect} />
      ))}
    </div>
  );
}
