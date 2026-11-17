import React, { useState } from 'react';
import { Lens } from '../lens/Lens.jsx';

export const GENRES = [
  { id: 'comedy', why: 'brighter grade · snappier cuts · room for the laugh' },
  { id: 'horror', why: 'cold grade · long holds · low drone' },
  { id: 'thriller', why: 'teal shadows · tight pacing · pulse under voice' },
  { id: 'action', why: 'punchy contrast · fast cuts · hits on the beat' },
  { id: 'romance', why: 'warm bloom · slow push-ins · soft piano' },
  { id: 'documentary', why: 'natural grade · patient cuts · lower-third captions' },
];

export function GenreSwitcher({ value: ctrl, onChange, scene = 'creator-portrait', image, size = 76, style }) {
  const [inner, setInner] = useState('documentary');
  const value = ctrl ?? inner;
  const cur = GENRES.find((g) => g.id === value) || GENRES[0];
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 14, ...style }}>
      <div style={{ display: 'flex', gap: 18 }}>
        {GENRES.map((g) => (
          <div key={g.id} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
            <Lens shape="circle" width={size} scene={scene} image={image} grade={g.id} glow={g.id === value} state={g.id === value ? 'selected' : 'rest'} onClick={() => { setInner(g.id); onChange && onChange(g.id); }} />
            <span style={{ font: 'var(--type-ui)', color: g.id === value ? 'var(--ink)' : 'var(--ink-secondary)' }}>{g.id}</span>
          </div>
        ))}
      </div>
      <div style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)' }}>{cur.id} · {cur.why}</div>
    </div>
  );
}
