import React from 'react';
import { Footage } from '../lens/Footage.jsx';
import { StatusDot } from '../core/StatusDot.jsx';

const LABEL = { video: 'video', broll: 'b-roll', voice: 'voice', music: 'music', captions: 'captions' };
const H = { video: 44, broll: 32, voice: 32, music: 28, captions: 28 };
const wave = (n, seed) => Array.from({ length: n }, (_, i) => 0.25 + Math.abs(Math.sin(i * 0.7 + seed) * Math.cos(i * 0.23 + seed * 2)) * 0.75);

export function WeaveTrack({ kind = 'video', clips = [], duration = 40, auto = true, exceptions = 0, note, playhead, labelWidth = 92, onToggleAuto, style }) {
  const h = H[kind];
  const pct = (x) => (x / duration) * 100 + '%';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, minHeight: h + 8, ...style }}>
      <div style={{ width: labelWidth, flex: 'none', display: 'flex', flexDirection: 'column', gap: 2 }}>
        <span style={{ font: 'var(--type-ui)' }}>{LABEL[kind]}</span>
        <button onClick={onToggleAuto} style={{ border: 'none', background: 'transparent', padding: 0, cursor: 'pointer', textAlign: 'left', color: 'var(--ink-secondary)' }}>
          <span style={{ whiteSpace: 'nowrap' }}>{exceptions > 0 ? <StatusDot status="attention" label={<span style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)' }}>{exceptions} to check</span>} /> : <span style={{ font: 'var(--type-meta)' }}>{auto ? 'autopilot' : 'manual'}</span>}</span>
        </button>
      </div>
      <div title={note} style={{ position: 'relative', flex: 1, height: h }}>
        <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: '50%', height: 1, background: 'var(--hairline)' }} />
        {kind === 'music' && (
          <svg viewBox="0 0 400 28" preserveAspectRatio="none" style={{ position: 'absolute', inset: 0, width: '100%', height: '100%' }}>
            {wave(100, 3).map((v, i) => { const d = clips.some((c) => c.duck && (i / 100) * duration >= c.start && (i / 100) * duration < c.start + c.dur) ? 0.5 : 1; return <rect key={i} x={i * 4} y={14 - v * 12 * d} width="2" height={v * 24 * d} rx="1" fill="var(--ink-tertiary)" />; })}
          </svg>
        )}
        {clips.filter((c) => !c.duck).map((c, i) => {
          const base = { position: 'absolute', left: pct(c.start), width: `calc(${pct(c.dur)} - 3px)`, top: 0, bottom: 0, borderRadius: 6, overflow: 'hidden' };
          if (kind === 'video' || kind === 'broll') return (
            <div key={i} title={c.reason} style={{ ...base, top: kind === 'broll' ? 2 : 0, bottom: kind === 'broll' ? 2 : 0, boxShadow: c.selected ? '0 0 0 2px var(--canvas), 0 0 0 3.5px var(--accent)' : '0 1px 2px rgba(17,17,17,.14)' }}>
              <Footage scene={c.scene} image={c.image} />
              {c.attention && <span style={{ position: 'absolute', top: 4, right: 4, width: 6, height: 6, borderRadius: '50%', background: 'var(--status-attention)', boxShadow: '0 0 0 1.5px #fff' }} />}
            </div>
          );
          if (kind === 'voice') return (
            <div key={i} style={{ ...base, background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', gap: 1.5, padding: '0 4px' }}>
              {wave(Math.max(6, Math.round(c.dur * 6)), i + 1).map((v, j) => <span key={j} style={{ flex: 1, minWidth: 1, height: `${v * 80}%`, borderRadius: 1, background: 'var(--ink-secondary)' }} />)}
            </div>
          );
          if (kind === 'captions') return (
            <div key={i} style={{ ...base, background: 'var(--surface-sunken)', display: 'flex', alignItems: 'center', padding: '0 6px', font: 'var(--type-meta)', color: 'var(--ink-secondary)', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{c.text}</div>
          );
          return null;
        })}
        {playhead != null && <div aria-hidden style={{ position: 'absolute', left: pct(playhead), top: -4, bottom: -4, width: 2, marginLeft: -1, borderRadius: 1, background: 'var(--ink)' }} />}
      </div>
    </div>
  );
}
