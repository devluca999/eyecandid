import React, { useState } from 'react';
import { Footage, FOOTAGE_SCENES } from './Footage.jsx';
import { glass, chromeEdge } from '../core/materials.js';

export function Lens({ shape = 'edit', aspect = '16:9', state = 'rest', scene = 'morning-sheets', image, grade, width = 480, glow = true, playing = false, progress, timecode, caption, label, onClick, onContextMenu, children, style }) {
  const [hover, setHover] = useState(false);
  const [a, b] = String(aspect).split(':').map(Number);
  const w = width;
  const h = shape === 'circle' ? w : shape === 'card' ? (w * 16) / 9 : (w * b) / a;
  const r = shape === 'circle' ? w / 2 : 20;
  const generating = state === 'generating';
  const selected = state === 'selected';
  const lifted = state === 'hover' || (hover && !generating);
  const glowColor = (FOOTAGE_SCENES[scene] || {}).glow || '#C9B8A0';
  const spring = 'var(--dur-morph) var(--spring)';
  const shadow = selected
    ? '0 0 0 2px var(--canvas), 0 0 0 4px var(--accent), var(--shadow-lens-lift)'
    : lifted ? 'var(--shadow-lens-lift)' : 'var(--shadow-lens-rest)';
  const showChrome = lifted || selected;
  return (
    <div
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onClick={onClick} onContextMenu={onContextMenu}
      style={{ position: 'relative', width: w, height: h, flex: 'none', cursor: onClick ? 'pointer' : 'default', transform: lifted || selected ? 'translateY(var(--hover-lift))' : 'none', transition: `width ${spring}, height ${spring}, transform var(--dur-lift) var(--spring)`, ...style }}>
      {glow && <div aria-hidden style={{ position: 'absolute', left: '10%', right: '10%', top: '18%', bottom: '-8%', borderRadius: r, background: glowColor, filter: `blur(${Math.max(18, w / 9)}px)`, opacity: lifted || selected ? .6 : .42, transition: `opacity var(--dur-lift) var(--ease-out), border-radius ${spring}` }} />}
      <div style={{ position: 'absolute', inset: 0, borderRadius: r, overflow: 'hidden', boxShadow: shadow, isolation: 'isolate', transition: `border-radius ${spring}, box-shadow var(--dur-lift) var(--ease-out)` }}>
        <Footage scene={scene} image={image} grade={grade} playing={playing} style={generating ? { filter: 'blur(10px) saturate(.6)', transform: 'scale(1.1)' } : undefined} />
        {generating && <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg,transparent 30%,rgba(255,255,255,.38) 50%,transparent 70%)', backgroundSize: '250% 100%', animation: 'el-shimmer 2.8s linear infinite' }} />}
        {caption && <div style={{ position: 'absolute', left: '8%', right: '8%', bottom: shape === 'card' ? '16%' : '10%', textAlign: 'center', font: w < 260 ? '700 13px/16px var(--font-sans)' : 'var(--type-caption)', color: '#fff', textShadow: 'var(--caption-shadow)', textWrap: 'balance' }}>{caption}</div>}
        {(timecode || label || generating) && shape !== 'circle' && (
          <div style={{ position: 'absolute', top: 12, left: 12, display: 'flex', gap: 8, alignItems: 'center', opacity: hover || selected || generating ? 1 : 0, transform: hover || selected || generating ? 'none' : 'translateY(-4px)', transition: 'opacity var(--dur-quick) var(--ease-out), transform var(--dur-lift) var(--spring)' }}>
            <div style={glass({ borderRadius: 999, padding: '4px 10px', display: 'flex', gap: 8, alignItems: 'center', font: 'var(--type-meta)', whiteSpace: 'nowrap' })}>
              {generating && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--status-working)', animation: 'el-pulse 1.4s infinite' }} />}
              {generating ? 'working' : label}
              {timecode && <span style={{ font: 'var(--type-timecode)', fontVariantNumeric: 'tabular-nums' }}>{timecode}</span>}
            </div>
          </div>
        )}
        {children}
        <div aria-hidden style={{ ...chromeEdge, opacity: showChrome ? 1 : .7 }} />
      </div>
      {progress != null && (
        <svg aria-hidden style={{ position: 'absolute', inset: -5, width: w + 10, height: h + 10, pointerEvents: 'none', overflow: 'visible' }}>
          <rect x="1.5" y="1.5" width={w + 7} height={h + 7} rx={r + 4} fill="none" stroke="var(--hairline)" strokeWidth="2" />
          <rect x="1.5" y="1.5" width={w + 7} height={h + 7} rx={r + 4} fill="none" stroke="var(--accent)" strokeWidth="2.5" strokeLinecap="round" pathLength="100" strokeDasharray={`${Math.max(0, Math.min(100, progress))} 100`} style={{ transition: 'stroke-dasharray .6s var(--ease-out)' }} />
        </svg>
      )}
    </div>
  );
}
