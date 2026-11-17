import React from 'react';
import { Icon } from '../core/Icon.jsx';
import { glass } from '../core/materials.js';

export function ExportPill({ state = 'idle', progress = 0, format = '9:16 · 1080p', onExport, onShare, style }) {
  const R = 8, C = 2 * Math.PI * R;
  return (
    <div style={{ ...glass({ borderRadius: 999, padding: 4, display: 'inline-flex', alignItems: 'center', gap: 4, height: 52 }), ...style }}>
      {state === 'idle' && <>
        <button onClick={onExport} style={{ height: 44, padding: '0 18px', borderRadius: 999, border: 'none', cursor: 'pointer', background: 'var(--ink)', color: 'var(--canvas)', font: 'var(--type-ui)', display: 'flex', gap: 8, alignItems: 'center' }}><Icon name="download" size={18} />export</button>
        <span style={{ font: 'var(--type-timecode)', color: 'var(--ink-secondary)', padding: '0 12px 0 6px', whiteSpace: 'nowrap' }}>{format}</span>
      </>}
      {state === 'exporting' && <div style={{ height: 44, padding: '0 16px 0 12px', display: 'flex', alignItems: 'center', gap: 10, font: 'var(--type-ui)' }}>
        <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden style={{ transform: 'rotate(-90deg)' }}><circle cx="10" cy="10" r={R} fill="none" stroke="var(--hairline)" strokeWidth="2" /><circle cx="10" cy="10" r={R} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinecap="round" strokeDasharray={`${(progress / 100) * C} ${C}`} style={{ transition: 'stroke-dasharray .6s var(--ease-out)' }} /></svg>
        exporting <span style={{ font: 'var(--type-timecode)', color: 'var(--ink-secondary)' }}>{Math.round(progress)}%</span>
      </div>}
      {state === 'done' && <>
        <span style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '0 10px 0 14px', font: 'var(--type-ui)' }}><span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-ready)' }} />ready</span>
        <button onClick={onShare} style={{ height: 44, padding: '0 18px', borderRadius: 999, border: 'none', cursor: 'pointer', background: 'var(--ink)', color: 'var(--canvas)', font: 'var(--type-ui)', display: 'flex', gap: 8, alignItems: 'center' }}><Icon name="share" size={18} />share</button>
      </>}
    </div>
  );
}
