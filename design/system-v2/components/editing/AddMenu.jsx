import React, { useState } from 'react';
import { Icon } from '../core/Icon.jsx';
import { glass } from '../core/materials.js';

const ITEMS = [
  { id: 'broll', icon: 'film', label: 'b-roll', hint: 'camera roll or stock' },
  { id: 'voice', icon: 'mic', label: 'voiceover', hint: 'record over the cut' },
  { id: 'music', icon: 'music', label: 'music', hint: 'ducks under your voice' },
  { id: 'captions', icon: 'captions', label: 'captions', hint: 'auto, word-timed' },
  { id: 'text', icon: 'type', label: 'text', hint: 'a title or a note' },
  { id: 'shot', icon: 'sparkles', label: 'ai shot', hint: 'describe it, we make it' },
];

export function AddMenu({ open: ctrl, onOpenChange, onPick, items = ITEMS, style }) {
  const [inner, setInner] = useState(true);
  const open = ctrl ?? inner;
  const toggle = () => { setInner(!open); onOpenChange && onOpenChange(!open); };
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'flex-start', gap: 10, ...style }}>
      {open && (
        <div style={glass({ padding: 6, display: 'grid', gridTemplateColumns: 'repeat(3, 120px)', gap: 2 })}>
          {items.map((it) => <Tile key={it.id} {...it} onClick={() => onPick && onPick(it.id)} />)}
        </div>
      )}
      <button aria-label="add" onClick={toggle} style={{ width: 44, height: 44, borderRadius: 999, border: '1px solid var(--glass-edge)', cursor: 'pointer', display: 'grid', placeItems: 'center', ...glass({ borderRadius: 999 }), transform: open ? 'rotate(45deg)' : 'none', transition: 'transform var(--dur-lift) var(--spring)' }}><Icon name="plus" /></button>
    </div>
  );
}

function Tile({ icon, label, hint, onClick }) {
  const [h, setH] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{ textAlign: 'left', border: 'none', cursor: 'pointer', borderRadius: 10, padding: 10, display: 'flex', flexDirection: 'column', gap: 6, color: 'var(--ink)', background: h ? 'color-mix(in srgb, var(--ink) 7%, transparent)' : 'transparent', transition: 'background var(--dur-quick)' }}>
      <Icon name={icon} />
      <span style={{ font: 'var(--type-ui)' }}>{label}</span>
      <span style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)' }}>{hint}</span>
    </button>
  );
}
