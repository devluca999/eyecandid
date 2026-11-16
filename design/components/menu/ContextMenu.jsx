import React from 'react';
import { Icon } from '../icons/Icon.jsx';

export const RATIOS = [
  { id: 'circle', label: 'circle', hint: 'theater', box: [14, 14], circle: true },
  { id: '9:16', label: '9:16', hint: 'reels', box: [9, 16] },
  { id: '4:5', label: '4:5', hint: 'feed', box: [13, 16] },
  { id: '1:1', label: '1:1', box: [15, 15] },
  { id: '16:9', label: '16:9', hint: 'youtube', box: [20, 11] },
  { id: '1.85', label: 'cinema', hint: '1.85', box: [22, 12] },
  { id: '2.39', label: 'cinema', hint: '2.39', box: [24, 10] },
];

export function RatioGlyph({ ratio, box, circle }) {
  const r = RATIOS.find((x) => x.id === ratio);
  const [w, h] = box || (r ? r.box : [14, 14]);
  return <span className={'el-ratio' + ((circle || (r && r.circle)) ? ' el-ratio--circle' : '')} aria-hidden="true"><span style={{ width: w, height: h }} /></span>;
}

function Item({ item, open, onOpen, onSelect }) {
  if (item.separator) return <div className="el-menu__sep" role="separator" />;
  if (item.heading) return <div className="el-menu__head">{item.heading}</div>;
  const hasSub = !!item.submenu;
  return (
    <div role="menuitem" aria-haspopup={hasSub || undefined}
      className={'el-menu__item' + (open ? ' is-open' : '') + (item.checked ? ' is-checked' : '')}
      onMouseEnter={() => onOpen(hasSub ? item.label : null)}
      onClick={() => !hasSub && onSelect && onSelect(item)}>
      {item.ratio ? <RatioGlyph ratio={item.ratio} /> : item.icon ? <Icon name={item.icon} size={16} /> : null}
      <span className="el-menu__label">{item.label}</span>
      {item.hint && <span className="el-menu__hint">{item.hint}</span>}
      {item.checked && <Icon name="check" size={14} />}
      {hasSub && <Icon name="chevron-right" size={14} />}
      {hasSub && open && (
        <div style={{ position: 'absolute', left: 'calc(100% + 8px)', top: -6, zIndex: 1 }}>
          <ContextMenu items={item.submenu} onSelect={onSelect} />
        </div>
      )}
    </div>
  );
}

export function ContextMenu({ items = [], openSubmenu, onSelect, style }) {
  const [open, setOpen] = React.useState(openSubmenu ?? null);
  return (
    <div className="el-glass el-menu el-pop" role="menu" style={style}>
      {items.map((it, i) => <Item key={i} item={it} open={open === it.label} onOpen={setOpen} onSelect={onSelect} />)}
    </div>
  );
}

/** The standard Lens menu. */
export function lensMenu({ ratio = '9:16', takes = 4 } = {}) {
  return [
    { label: 'aspect ratio', icon: 'crop', submenu: RATIOS.map((r) => ({ label: r.label, hint: r.hint, ratio: r.id, value: r.id, checked: r.id === ratio })) },
    { label: 'style', icon: 'wand-sparkles', submenu: [{ heading: 'my styles' }, { label: 'bedtime warm', value: 'style:bedtime' }, { separator: true }, { label: 'punch-in zoom', value: 'style:punch' }, { label: 'speed ramp', value: 'style:ramp' }, { label: 'whip pan', value: 'style:whip' }, { separator: true }, { label: 'browse styles', value: 'style:browse' }] },
    { separator: true },
    { label: 'edit with ai', icon: 'sparkles', hint: 'E', value: 'ai' },
    { label: 'takes', icon: 'layers', hint: String(takes), submenu: [{ label: 'flick through', value: 'takes:stack' }, { label: 'mix takes', value: 'takes:mix' }] },
    { label: 'save as style', icon: 'bookmark', value: 'save-style' },
    { separator: true },
    { label: 'export', icon: 'download', hint: '⌘⇧E', submenu: [{ label: 'full length', value: 'export:full' }, { label: '15s cutdown', value: 'export:15' }, { label: '30s cutdown', value: 'export:30' }, { label: '60s cutdown', value: 'export:60' }] },
  ];
}
