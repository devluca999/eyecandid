import React, { useRef, useState } from 'react';
import { Icon } from '../core/Icon.jsx';

export function DropZone({ state: ctrl, onFiles, title = 'drop a clip', hint = 'or paste a link · mp4, mov · up to 10 min', height = 240, style }) {
  const [over, setOver] = useState(false);
  const input = useRef(null);
  const state = ctrl ?? (over ? 'over' : 'idle');
  const isOver = state === 'over';
  const busy = state === 'uploading';
  return (
    <div role="button" tabIndex={0} onClick={() => input.current && input.current.click()}
      onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); onFiles && onFiles(Array.from(e.dataTransfer.files)); }}
      style={{ position: 'relative', height, borderRadius: 20, cursor: 'pointer', overflow: 'hidden', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, textAlign: 'center', outline: 'none',
        background: isOver ? 'var(--surface-raised)' : 'var(--surface-sunken)',
        boxShadow: isOver ? '0 0 0 2px var(--canvas), 0 0 0 4px var(--accent), var(--shadow-lens-lift)' : 'inset 0 1px 3px rgba(17,17,17,.08), inset 0 0 0 1px color-mix(in srgb, var(--hairline) 60%, transparent)',
        transform: isOver ? 'translateY(-4px) scale(1.01)' : 'none', transition: 'transform var(--dur-lift) var(--spring), box-shadow var(--dur-lift) var(--ease-out), background var(--dur-quick)', ...style }}>
      <input ref={input} type="file" accept="video/*" multiple hidden onChange={(e) => onFiles && onFiles(Array.from(e.target.files))} />
      {busy && <div aria-hidden style={{ position: 'absolute', inset: 0, background: 'linear-gradient(100deg,transparent 30%,rgba(255,255,255,.5) 50%,transparent 70%)', backgroundSize: '250% 100%', animation: 'el-shimmer 2.8s linear infinite' }} />}
      <div style={{ position: 'relative', width: 56, height: 56, borderRadius: '50%', background: 'var(--surface-raised)', display: 'grid', placeItems: 'center', boxShadow: 'var(--shadow-lens-rest)', transform: isOver ? 'translateY(-4px)' : 'none', transition: 'transform var(--dur-lift) var(--spring)' }}><Icon name={busy ? 'sparkles' : 'arrow-down'} size={22} /></div>
      <div style={{ position: 'relative' }}>
        <div style={{ font: 'var(--type-heading)' }}>{busy ? 'reading your clip…' : isOver ? 'let go' : title}</div>
        <div style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)', marginTop: 4 }}>{busy ? 'finding the good parts · about a minute' : hint}</div>
      </div>
    </div>
  );
}
