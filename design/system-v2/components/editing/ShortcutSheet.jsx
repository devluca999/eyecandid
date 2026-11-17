import React from 'react';
import { glass } from '../core/materials.js';

const DEFAULT = [
  { title: 'playback', rows: [['play / pause', ['space']], ['back / forward 1s', ['J', 'L']], ['theater mode', ['T']]] },
  { title: 'editing', rows: [['trim here', ['S']], ['split', ['⌘', 'B']], ['talk to the edit', ['/']], ['undo', ['⌘', 'Z']]] },
  { title: 'view', rows: [['edit · card · theater', ['1', '2', '3']], ['timeline drawer', ['⌘', 'E']], ['this sheet', ['?']]] },
];

const Kbd = ({ k }) => <kbd style={{ minWidth: 24, height: 24, padding: '0 6px', display: 'inline-grid', placeItems: 'center', borderRadius: 6, background: 'var(--surface-sunken)', boxShadow: 'inset 0 -1px 0 var(--hairline)', font: 'var(--type-timecode)', color: 'var(--ink)' }}>{k}</kbd>;

export function ShortcutSheet({ groups = DEFAULT, style }) {
  return (
    <div style={{ ...glass({ padding: 20, width: 620, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 24 }), ...style }}>
      {groups.map((g) => (
        <div key={g.title} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)' }}>{g.title}</div>
          {g.rows.map(([label, keys]) => (
            <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 8, font: 'var(--type-ui)' }}>
              <span style={{ flex: 1 }}>{label}</span>
              <span style={{ display: 'flex', gap: 3 }}>{keys.map((k) => <Kbd key={k} k={k} />)}</span>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}
