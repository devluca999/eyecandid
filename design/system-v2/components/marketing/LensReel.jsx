import React, { useState } from 'react';
import { Lens } from '../lens/Lens.jsx';

const DEFAULT = [
  { scene: 'creator-portrait', caption: 'okay I have to tell you', shape: 'card' },
  { scene: 'walnut-lamp', caption: 'it lives on my nightstand', shape: 'card' },
  { scene: 'gym-dumbbell', caption: 'yes, even at the gym', shape: 'card' },
  { scene: 'rose-case', caption: 'and it comes in this', shape: 'card' },
  { scene: 'morning-sheets', caption: 'every single morning', shape: 'card' },
];

function Item({ it, width }) {
  const [h, setH] = useState(false);
  return (
    <div onMouseEnter={() => setH(true)} onMouseLeave={() => setH(false)} style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <Lens shape={it.shape} width={width} scene={it.scene} image={it.image} grade={h ? 'documentary' : 'none'} caption={h ? null : it.caption} playing={!h} label={h ? 'before' : 'after'} timecode={h ? 'raw' : '0:31'} />
      <div style={{ display: 'flex', justifyContent: 'space-between', font: 'var(--type-meta)', color: 'var(--ink-secondary)' }}><span>{h ? 'before · raw take' : 'after'}</span><span>{h ? '' : 'hover for before'}</span></div>
    </div>
  );
}

export function LensReel({ title = 'Same people. Same phones. Better takes.', items = DEFAULT, width = 200, style }) {
  return (
    <section style={{ padding: 'clamp(48px, 8vw, 96px) clamp(20px, 5vw, 64px)', display: 'flex', flexDirection: 'column', gap: 32, ...style }}>
      <h2 style={{ margin: 0, font: 'var(--type-title)', fontSize: 'clamp(24px, 3vw, 36px)', lineHeight: 1.15, letterSpacing: '-0.02em', maxWidth: 520, textWrap: 'balance' }}>{title}</h2>
      <div style={{ display: 'flex', gap: 24, overflowX: 'auto', padding: '8px 4px 40px', margin: '-8px -4px -40px' }}>
        {items.map((it, i) => <Item key={i} it={it} width={width} />)}
      </div>
    </section>
  );
}
