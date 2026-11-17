import React, { useState } from 'react';
import { Icon } from '../core/Icon.jsx';
import { glass } from '../core/materials.js';

export function PromptBubble({ context, placeholder = 'what should change?', suggestions = [], value, onChange, onSubmit, listening = false, reply, tail = 'bottom', width = 380, style }) {
  const [inner, setInner] = useState('');
  const v = value ?? inner;
  const set = (t) => { setInner(t); onChange && onChange(t); };
  const submit = (t) => { onSubmit && onSubmit(t ?? v); if (value === undefined) setInner(''); };
  const bars = [6, 14, 9, 18, 11, 16, 7, 13, 10, 15, 8];
  return (
    <div style={{ position: 'relative', width, ...style }}>
      <div style={glass({ padding: 12, display: 'flex', flexDirection: 'column', gap: 10 })}>
        {context && <div style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)', padding: '0 4px', display: 'flex', gap: 6, alignItems: 'center' }}><Icon name="mouse-pointer-2" size={14} />{context}</div>}
        {reply && <div style={{ font: 'var(--type-ui)', padding: '0 4px', display: 'flex', gap: 8, alignItems: 'flex-start' }}><Icon name="sparkles" size={16} style={{ marginTop: 1 }} /><span>{reply}</span></div>}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {listening ? (
            <div style={{ flex: 1, height: 44, display: 'flex', alignItems: 'center', gap: 3, padding: '0 6px' }}>
              {bars.map((h, i) => <span key={i} style={{ width: 3, height: h, borderRadius: 2, background: 'var(--ink)', animation: `el-pulse ${0.7 + (i % 4) * 0.15}s ease-in-out infinite` }} />)}
              <span style={{ font: 'var(--type-ui)', color: 'var(--ink-secondary)', marginLeft: 8 }}>listening…</span>
            </div>
          ) : (
            <input value={v} placeholder={placeholder} onChange={(e) => set(e.target.value)} onKeyDown={(e) => e.key === 'Enter' && v && submit()}
              style={{ flex: 1, minWidth: 0, height: 44, border: 'none', outline: 'none', background: 'transparent', font: 'var(--type-body)', color: 'var(--ink)', padding: '0 6px' }} />
          )}
          <button aria-label="talk" style={{ width: 44, height: 44, borderRadius: 999, border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', background: listening ? 'var(--ink)' : 'transparent', color: listening ? 'var(--canvas)' : 'var(--ink)' }}><Icon name="mic" /></button>
          <button aria-label="send" onClick={() => v && submit()} style={{ width: 44, height: 44, borderRadius: 999, border: 'none', cursor: 'pointer', display: 'grid', placeItems: 'center', background: 'var(--ink)', color: 'var(--canvas)', opacity: v || listening ? 1 : .35, transition: 'opacity var(--dur-quick)' }}><Icon name="arrow-up" /></button>
        </div>
        {suggestions.length > 0 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
            {suggestions.map((t) => <button key={t} onClick={() => submit(t)} style={{ height: 32, padding: '0 10px', borderRadius: 6, whiteSpace: 'nowrap', border: 'none', cursor: 'pointer', background: 'color-mix(in srgb, var(--ink) 6%, transparent)', color: 'var(--ink)', font: 'var(--type-ui)' }}>{t}</button>)}
          </div>
        )}
      </div>
      {tail !== 'none' && <div aria-hidden style={{ position: 'absolute', left: '50%', [tail === 'bottom' ? 'bottom' : 'top']: -7, width: 14, height: 14, transform: 'translateX(-50%) rotate(45deg)', background: 'var(--glass-fill)', WebkitBackdropFilter: 'var(--glass-blur)', backdropFilter: 'var(--glass-blur)', borderRadius: 3, [tail === 'bottom' ? 'borderRight' : 'borderLeft']: '1px solid var(--glass-edge)', [tail === 'bottom' ? 'borderBottom' : 'borderTop']: '1px solid var(--glass-edge)' }} />}
    </div>
  );
}
