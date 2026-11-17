import React, { useState } from 'react';
import { Icon } from '../core/Icon.jsx';
import { glass } from '../core/materials.js';

export const ASPECTS = [
  { id: '9:16', label: 'vertical', w: 9, h: 16 },
  { id: '4:5', label: 'portrait', w: 4, h: 5 },
  { id: '1:1', label: 'square', w: 1, h: 1 },
  { id: '16:9', label: 'wide', w: 16, h: 9 },
  { id: '2.39:1', label: 'cinema', w: 2.39, h: 1 },
];

export function AspectGlyph({ w, h, size = 20, active }) {
  const s = 16 / Math.max(w, h);
  const gw = Math.max(5, w * s), gh = Math.max(5, h * s);
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" aria-hidden style={{ flex: 'none' }}>
      <rect x={10 - gw / 2} y={10 - gh / 2} width={gw} height={gh} rx="2.5" fill="none" stroke={active ? 'var(--accent)' : 'currentColor'} strokeWidth="1.5" />
    </svg>
  );
}

const DEFAULT_ITEMS = [
  { id: 'trim', icon: 'scissors', label: 'trim here', shortcut: 'S' },
  { id: 'split', icon: 'split', label: 'split', shortcut: '⌘B' },
  { id: 'broll', icon: 'film', label: 'cover with b-roll' },
  { id: 'captions', icon: 'captions', label: 'edit captions', shortcut: 'C' },
  { id: 'aspect', icon: 'crop', label: 'aspect ratio', submenu: 'aspect' },
  { separator: true },
  { id: 'duplicate', icon: 'copy', label: 'duplicate', shortcut: '⌘D' },
  { id: 'delete', icon: 'trash-2', label: 'delete', shortcut: '⌫' },
];

function Row({ icon, glyph, label, shortcut, hasSub, checked, onClick, onEnter }) {
  const [h, setH] = useState(false);
  return (
    <div role="menuitem" onClick={onClick} onMouseEnter={() => { setH(true); onEnter && onEnter(); }} onMouseLeave={() => setH(false)}
      style={{ height: 36, padding: '0 10px', borderRadius: 10, display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', font: 'var(--type-ui)', background: h ? 'color-mix(in srgb, var(--ink) 7%, transparent)' : 'transparent', transition: 'background var(--dur-quick)' }}>
      {glyph || (icon && <Icon name={icon} size={18} />)}
      <span style={{ flex: 1 }}>{label}</span>
      {shortcut && <span style={{ font: 'var(--type-timecode)', color: 'var(--ink-secondary)' }}>{shortcut}</span>}
      {checked && <Icon name="check" size={16} color="var(--accent-text)" />}
      {hasSub && <Icon name="chevron-right" size={16} style={{ color: 'var(--ink-secondary)' }} />}
    </div>
  );
}

export function ContextMenu({ items = DEFAULT_ITEMS, aspect = '9:16', openSubmenu, onSelect, onAspect, style }) {
  const [sub, setSub] = useState(openSubmenu || null);
  return (
    <div role="menu" style={{ position: 'relative', display: 'inline-flex', alignItems: 'flex-start', gap: 6, ...style }}>
      <div style={glass({ width: 232, padding: 6, display: 'flex', flexDirection: 'column', gap: 1 })}>
        {items.map((it, i) => it.separator
          ? <div key={i} style={{ height: 1, margin: '5px 10px', background: 'var(--hairline)', opacity: .7 }} />
          : <Row key={it.id} {...it} hasSub={!!it.submenu} onEnter={() => setSub(it.submenu || null)} onClick={() => !it.submenu && onSelect && onSelect(it.id)} />)}
      </div>
      {sub === 'aspect' && (
        <div style={glass({ width: 196, padding: 6, display: 'flex', flexDirection: 'column', gap: 1, marginTop: 4 * 37 + 6 })}>
          {ASPECTS.map((a) => <Row key={a.id} glyph={<AspectGlyph w={a.w} h={a.h} active={a.id === aspect} />} label={a.label} shortcut={a.id} checked={a.id === aspect} onClick={() => onAspect && onAspect(a.id)} />)}
        </div>
      )}
    </div>
  );
}
