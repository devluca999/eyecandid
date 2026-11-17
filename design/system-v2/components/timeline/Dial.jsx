import React, { useRef, useState } from 'react';

export function Dial({ value: ctrl, defaultValue = 60, onChange, label = 'pace', minLabel = 'calm', maxLabel = 'punchy', size = 96, describe, style }) {
  const [inner, setInner] = useState(defaultValue);
  const v = ctrl ?? inner;
  const drag = useRef(null);
  const set = (n) => { const c = Math.max(0, Math.min(100, Math.round(n))); setInner(c); onChange && onChange(c); };
  const ang = -135 + (v / 100) * 270;
  const r = size / 2, ticks = 27;
  const word = describe ? describe(v) : v < 34 ? minLabel : v > 66 ? maxLabel : 'balanced';
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', alignItems: 'center', gap: 10, userSelect: 'none', ...style }}>
      <div
        onPointerDown={(e) => { drag.current = { y: e.clientY, v }; e.currentTarget.setPointerCapture(e.pointerId); }}
        onPointerMove={(e) => drag.current && set(drag.current.v + (drag.current.y - e.clientY) * 0.6)}
        onPointerUp={() => { drag.current = null; }}
        onWheel={(e) => set(v - Math.sign(e.deltaY) * 4)}
        role="slider" aria-valuenow={v} aria-label={label} tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(v + 5); if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(v - 5); }}
        style={{ position: 'relative', width: size + 24, height: size + 24, cursor: 'ns-resize', outline: 'none' }}>
        <svg width={size + 24} height={size + 24} style={{ position: 'absolute', inset: 0 }} aria-hidden>
          {Array.from({ length: ticks }, (_, i) => {
            const a = ((-135 + (i / (ticks - 1)) * 270 - 90) * Math.PI) / 180;
            const on = i / (ticks - 1) <= v / 100;
            const c = r + 12, r1 = r + 6, r2 = r + (i % 13 === 0 ? 11 : 9);
            return <line key={i} x1={c + Math.cos(a) * r1} y1={c + Math.sin(a) * r1} x2={c + Math.cos(a) * r2} y2={c + Math.sin(a) * r2} stroke={on ? 'var(--ink)' : 'var(--ink-tertiary)'} strokeOpacity={on ? 1 : .5} strokeWidth="1.5" strokeLinecap="round" />;
          })}
        </svg>
        <div style={{ position: 'absolute', inset: 12, borderRadius: '50%', background: 'var(--chrome-gradient)', padding: 1, boxShadow: 'var(--shadow-lens-rest)' }}>
          <div style={{ width: '100%', height: '100%', borderRadius: '50%', background: 'radial-gradient(circle at 40% 30%, var(--surface-raised), var(--surface-sunken))', transform: `rotate(${ang}deg)`, transition: drag.current ? 'none' : 'transform var(--dur-lift) var(--spring)' }}>
            <div style={{ position: 'absolute', left: '50%', top: 10, width: 2, height: size * 0.2, marginLeft: -1, borderRadius: 1, background: 'var(--ink)' }} />
          </div>
        </div>
      </div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ font: 'var(--type-ui)' }}>{label}</div>
        <div style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)' }}>{word}</div>
      </div>
    </div>
  );
}
