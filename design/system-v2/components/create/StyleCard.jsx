import React from 'react';
import { Lens } from '../lens/Lens.jsx';

const SAMPLE = 'the only ring I wear';
function Sample({ kind, text }) {
  const base = { position: 'absolute', color: '#fff', textShadow: 'var(--caption-shadow)' };
  if (kind === 'clean') return <div style={{ ...base, left: '8%', right: '8%', bottom: '12%', textAlign: 'center', font: '700 17px/21px var(--font-sans)' }}>{text}</div>;
  if (kind === 'karaoke') { const w = text.split(' '); return <div style={{ ...base, left: '8%', right: '8%', bottom: '12%', textAlign: 'center', font: '700 17px/21px var(--font-sans)' }}>{w.map((x, i) => <span key={i} style={{ padding: '0 3px', borderRadius: 6, background: i === 2 ? 'rgba(17,17,17,.4)' : 'transparent', opacity: i > 2 ? .6 : 1 }}>{x} </span>)}</div>; }
  if (kind === 'loud') return <div style={{ ...base, left: '6%', right: '6%', top: '40%', textAlign: 'center', font: '800 24px/24px var(--font-sans)', letterSpacing: '-0.02em', textTransform: 'uppercase' }}>{text}</div>;
  if (kind === 'boxed') return <div style={{ position: 'absolute', left: '10%', right: '10%', bottom: '12%', display: 'flex', justifyContent: 'center' }}><span style={{ background: 'rgba(17,17,17,.62)', color: '#fff', borderRadius: 6, padding: '4px 8px', font: '600 14px/19px var(--font-sans)', textAlign: 'center' }}>{text}</span></div>;
  return <div style={{ ...base, left: '9%', bottom: '10%', font: '500 13px/17px var(--font-sans)', textShadow: 'var(--caption-shadow)' }}>{text}</div>;
}

export function StyleCard({ name = 'clean', kind, scene = 'walnut-lamp', image, width = 160, selected = false, sample = SAMPLE, onClick, style }) {
  const k = kind || name;
  return (
    <div style={{ display: 'inline-flex', flexDirection: 'column', gap: 10, width, ...style }}>
      <Lens shape="edit" aspect="4:5" width={width} scene={scene} image={image} glow={selected} state={selected ? 'selected' : 'rest'} onClick={onClick}><Sample kind={k} text={sample} /></Lens>
      <span style={{ font: 'var(--type-ui)', color: selected ? 'var(--ink)' : 'var(--ink-secondary)' }}>{name}</span>
    </div>
  );
}
