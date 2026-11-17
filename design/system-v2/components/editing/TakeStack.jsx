import React, { useState } from 'react';
import { Lens } from '../lens/Lens.jsx';
import { Button } from '../core/Button.jsx';
import { glass } from '../core/materials.js';

const DEFAULT = [
  { scene: 'creator-portrait', note: 'steadiest voice · no ums', best: true },
  { scene: 'creator-portrait', grade: 'documentary', note: 'laughed mid-line · kept it' },
  { scene: 'creator-portrait', grade: 'comedy', note: 'looked off-camera at 0:03' },
];

export function TakeStack({ takes = DEFAULT, index: ctrl, onChange, onKeep, onRetry, width = 240, style }) {
  const [inner, setInner] = useState(0);
  const index = ctrl ?? inner;
  const go = (i) => { const n = (i + takes.length) % takes.length; setInner(n); onChange && onChange(n); };
  const t = takes[index];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16, width: width + 60, ...style }}>
      <div style={{ position: 'relative', width, height: (width * 16) / 9 }}>
        {takes.map((tk, i) => {
          const d = (i - index + takes.length) % takes.length;
          return (
            <div key={i} onClick={() => go(i)} style={{ position: 'absolute', inset: 0, zIndex: takes.length - d, transform: `translateX(${d * 18}px) rotate(${d * 3}deg) scale(${1 - d * 0.05})`, transformOrigin: 'bottom left', opacity: d > 2 ? 0 : 1 - d * 0.15, transition: 'transform var(--dur-morph) var(--spring), opacity var(--dur-lift)' }}>
              <Lens shape="card" width={width} scene={tk.scene} image={tk.image} grade={tk.grade} glow={d === 0} playing={d === 0} style={{ transform: 'none' }}>
                {d === 0 && <div style={{ position: 'absolute', left: 12, right: 12, bottom: 12, ...glass({ padding: '10px 12px' }) }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--type-ui)', whiteSpace: 'nowrap' }}><span>take {i + 1} of {takes.length}</span>{tk.best && <span style={{ color: 'var(--ink-secondary)' }}>best</span>}</div>
                  <div style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)', marginTop: 2 }}>{tk.note}</div>
                </div>}
              </Lens>
            </div>
          );
        })}
      </div>
      <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-start' }}>
        <Button icon="check" onClick={() => onKeep && onKeep(index)}>keep</Button>
        <Button variant="quiet" icon="refresh-cw" onClick={() => onRetry && onRetry(index)}>try again</Button>
        <Button variant="quiet" icon="chevron-right" title="next take" onClick={() => go(index + 1)} />
      </div>
    </div>
  );
}
