import React, { useState } from 'react';
import { Footage } from '../lens/Footage.jsx';

const DEFAULT = [
  { kind: 'clip', dur: 3.2, scene: 'creator-portrait', key: 'hook' },
  { kind: 'filler', dur: 0.6, label: 'um' },
  { kind: 'clip', dur: 4.1, scene: 'morning-sheets' },
  { kind: 'pause', dur: 0.4 },
  { kind: 'clip', dur: 2.6, scene: 'walnut-lamp', key: 'nightstand' },
  { kind: 'filler', dur: 0.8, label: 'like, so' },
  { kind: 'clip', dur: 3.4, scene: 'rose-case' },
  { kind: 'clip', dur: 2.2, scene: 'gym-dumbbell', key: 'cta' },
];

export function BeadThread({ segments = DEFAULT, playhead = 0.38, selected, onSelect, explain = 'removed 2 fillers · 1 pause · 1.8s', width = 640, style }) {
  const [hover, setHover] = useState(null);
  const total = segments.reduce((a, s) => a + s.dur, 0);
  const fixed = segments.reduce((a, s) => a + (s.kind === 'filler' ? Math.max(28, (s.label || '').length * 6.5 + 14) : s.kind === 'pause' ? 8 : 0), 0);
  const unit = (width - segments.length * 4 - fixed) / segments.filter((s) => s.kind === 'clip').reduce((a, s) => a + s.dur, 0);
  let t = 0;
  const marks = segments.map((s) => { const st = t; t += s.dur; return st; });
  const fmt = (x) => { const s = x * total; return `0:${String(Math.floor(s)).padStart(2, '0')}.${Math.floor((s % 1) * 10)}`; };
  return (
    <div style={{ width, ...style }}>
      <div style={{ position: 'relative', height: 64 }}>
        <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 36, height: 1, background: 'var(--hairline)' }} />
        <div style={{ position: 'absolute', left: 0, right: 0, top: 22, height: 28, display: 'flex', alignItems: 'center', gap: 4 }}>
          {segments.map((s, i) => {
            const w = s.kind === 'filler' ? Math.max(28, (s.label || '').length * 6.5 + 14) : s.kind === 'pause' ? 8 : Math.max(18, s.dur * unit);
            const sel = selected === i, hv = hover === i;
            const common = { position: 'relative', flex: 'none', width: w, cursor: 'pointer', transition: 'transform var(--dur-lift) var(--spring), box-shadow var(--dur-quick)', transform: hv || sel ? 'translateY(-2px)' : 'none' };
            const ring = sel ? '0 0 0 2px var(--canvas), 0 0 0 3.5px var(--accent)' : hv ? 'var(--shadow-lens-rest)' : '0 1px 2px rgba(17,17,17,.12)';
            return (
              <div key={i} onClick={() => onSelect && onSelect(i)} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)} title={s.kind === 'filler' ? `removed ‘${s.label}’` : s.key || ''} style={common}>
                {s.key && <div aria-hidden style={{ position: 'absolute', left: 6, top: -14, width: 1.5, height: 10, borderRadius: 1, background: 'var(--ink)' }} />}
                {s.key && (hv || sel) && <div style={{ position: 'absolute', left: 0, top: -34, font: 'var(--type-meta)', color: 'var(--ink-secondary)', whiteSpace: 'nowrap' }}>key · {s.key}</div>}
                {s.kind === 'clip' && <div style={{ position: 'relative', height: 28, borderRadius: 999, overflow: 'hidden', boxShadow: ring }}><Footage scene={s.scene} image={s.image} /></div>}
                {s.kind === 'filler' && <div style={{ height: 22, borderRadius: 999, background: 'var(--surface-sunken)', boxShadow: sel ? ring : 'none', display: 'grid', placeItems: 'center', font: 'var(--type-meta)', color: 'var(--ink-tertiary)', textDecoration: 'line-through', whiteSpace: 'nowrap', overflow: 'hidden', padding: '0 6px' }}>{s.label}</div>}
                {s.kind === 'pause' && <div style={{ width: 6, height: 6, margin: '0 auto', borderRadius: '50%', background: 'var(--ink-tertiary)' }} />}
              </div>
            );
          })}
        </div>
        <div aria-hidden style={{ position: 'absolute', left: `${playhead * 100}%`, top: 12, bottom: 4, width: 2, marginLeft: -1, borderRadius: 1, background: 'var(--ink)' }} />
        <div style={{ position: 'absolute', left: `${playhead * 100}%`, top: -6, transform: 'translateX(-50%)', font: 'var(--type-timecode)', color: 'var(--ink)' }}>{fmt(playhead)}</div>
      </div>
      {explain && <div style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)', marginTop: 6 }}>{explain}</div>}
    </div>
  );
}
