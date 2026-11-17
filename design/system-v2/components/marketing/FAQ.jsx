import React, { useState } from 'react';
import { Icon } from '../core/Icon.jsx';

const DEFAULT = [
  { q: 'Will it change what I said?', a: 'No. We cut fillers and dead air and fix caption spelling. Your words stay your words — every cut is listed so you can put it back.' },
  { q: 'Does it work with AI-generated clips?', a: 'Yes. Drop in phone footage, AI footage or both. We pace and caption them the same way.' },
  { q: 'How long does an edit take?', a: 'About a minute for a one-minute clip. Longer clips take a little longer; you can keep filming while it works.' },
  { q: 'Who owns my videos?', a: 'You do. We don’t train on your footage, and you can delete everything in one tap.' },
  { q: 'Is there a student discount?', a: 'Half off any paid plan with a school email.' },
];

export function FAQ({ items = DEFAULT, title = 'Questions, honestly answered', style }) {
  const [open, setOpen] = useState(0);
  return (
    <section style={{ padding: 'clamp(48px, 8vw, 96px) clamp(20px, 5vw, 64px)', display: 'flex', justifyContent: 'center', ...style }}>
      <div style={{ width: '100%', maxWidth: 720 }}>
        <h2 style={{ margin: '0 0 24px', font: 'var(--type-title)', letterSpacing: '-0.01em' }}>{title}</h2>
        {items.map((it, i) => (
          <div key={i} style={{ borderTop: '1px solid var(--hairline)' }}>
            <button onClick={() => setOpen(open === i ? -1 : i)} aria-expanded={open === i} style={{ width: '100%', minHeight: 60, display: 'flex', alignItems: 'center', gap: 16, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', font: 'var(--type-heading)', fontSize: 17, color: 'var(--ink)', padding: 0 }}>
              <span style={{ flex: 1 }}>{it.q}</span>
              <Icon name="plus" style={{ transform: open === i ? 'rotate(45deg)' : 'none', transition: 'transform var(--dur-lift) var(--spring)' }} />
            </button>
            <div style={{ display: 'grid', gridTemplateRows: open === i ? '1fr' : '0fr', transition: 'grid-template-rows var(--dur-morph) var(--spring-soft)' }}>
              <div style={{ overflow: 'hidden' }}><p style={{ margin: '0 0 20px', font: 'var(--type-body)', color: 'var(--ink-secondary)', maxWidth: 600 }}>{it.a}</p></div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
