import React, { useState } from 'react';
import { Lens } from '../lens/Lens.jsx';
import { Icon } from '../core/Icon.jsx';
import { glass } from '../core/materials.js';

const DEFAULT = [
  { scene: 'walnut-lamp', reason: 'you said ‘nightstand’', at: '0:14' },
  { scene: 'rose-case', reason: 'you said ‘jewelry box’', at: '0:21' },
  { scene: 'morning-sheets', reason: 'matches ‘every morning’', at: '0:06' },
];

const paper = (x) => ({ background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 16, boxShadow: 'var(--shadow-lens-rest)', color: 'var(--ink)', ...x });

export function BrollSheet({ query = 'nightstand', items = DEFAULT, selected: ctrl, onPick, onClose, material = 'glass', style }) {
  const [inner, setInner] = useState(0);
  const sel = ctrl ?? inner;
  return (
    <div style={{ ...(material === 'paper' ? paper : glass)({ padding: 16, width: 540, display: 'flex', flexDirection: 'column', gap: 14 }), ...style }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
        <span style={{ font: 'var(--type-heading)', flex: 1 }}>b-roll</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, height: 36, padding: '0 12px', borderRadius: 999, background: 'color-mix(in srgb, var(--ink) 6%, transparent)', font: 'var(--type-ui)', color: 'var(--ink-secondary)', width: 200 }}><Icon name="search" size={16} />{query}</div>
        <button aria-label="close" onClick={onClose} style={{ width: 44, height: 44, border: 'none', background: 'transparent', borderRadius: 999, cursor: 'pointer', display: 'grid', placeItems: 'center', color: 'var(--ink)' }}><Icon name="x" /></button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
        {items.map((it, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <Lens shape="edit" aspect="4:5" width={160} scene={it.scene} image={it.image} glow={false} state={i === sel ? 'selected' : 'rest'} onClick={() => { setInner(i); onPick && onPick(i); }} timecode={it.at} />
            <span style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)' }}>{it.reason}</span>
          </div>
        ))}
      </div>
      <div style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)' }}>autopilot used the first · swap anytime</div>
    </div>
  );
}
