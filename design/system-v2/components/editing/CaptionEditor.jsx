import React, { useState } from 'react';
import { Lens } from '../lens/Lens.jsx';
import { glass } from '../core/materials.js';

const DEFAULT_WORDS = ['it’s', 'honestly', 'the', 'only', 'ring', 'I', 'wear', 'every', 'day'];

export function CaptionEditor({ words = DEFAULT_WORDS, active = 3, emphasis = [3], scene = 'morning-sheets', width = 300, captionStyle = 'clean', onChange, note = 'fixed spelling · ‘honestly’', style }) {
  const [list, setList] = useState(words);
  const [editing, setEditing] = useState(null);
  const caption = (
    <span>{list.map((w, i) => <span key={i} style={{ padding: '0 2px', borderRadius: 6, background: captionStyle === 'karaoke' && i === active ? 'rgba(17,17,17,.35)' : 'transparent', fontWeight: emphasis.includes(i) ? 800 : 700 }}>{w}{' '}</span>)}</span>
  );
  return (
    <div style={{ position: 'relative', width, ...style }}>
      <Lens shape="edit" aspect="4:5" width={width} scene={scene}><div style={{ position: 'absolute', left: '8%', right: '8%', bottom: 56, textAlign: 'center', font: 'var(--type-caption)', color: '#fff', textShadow: 'var(--caption-shadow)', textWrap: 'balance' }}>{caption}</div></Lens>
      <div style={{ position: 'relative', marginTop: -40, marginLeft: 12, marginRight: 12, zIndex: 2, ...glass({ padding: 10 }) }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
          {list.map((w, i) => editing === i ? (
            <input key={i} autoFocus defaultValue={w} onBlur={(e) => { const n = [...list]; n[i] = e.target.value; setList(n); setEditing(null); onChange && onChange(n); }} onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
              style={{ width: Math.max(40, w.length * 9), height: 28, border: 'none', outline: 'none', borderRadius: 6, padding: '0 6px', font: 'var(--type-ui)', background: 'var(--surface-raised)', color: 'var(--ink)', boxShadow: '0 0 0 1.5px var(--accent)' }} />
          ) : (
            <button key={i} onClick={() => setEditing(i)} style={{ height: 28, padding: '0 6px', borderRadius: 6, border: 'none', cursor: 'text', font: 'var(--type-ui)', fontWeight: emphasis.includes(i) ? 700 : 500, color: i === active ? 'var(--accent-text)' : 'var(--ink)', background: i === active ? 'color-mix(in srgb, var(--accent) 14%, transparent)' : 'transparent' }}>{w}</button>
          ))}
        </div>
        {note && <div style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)', padding: '6px 6px 0' }}>{note}</div>}
      </div>
    </div>
  );
}
