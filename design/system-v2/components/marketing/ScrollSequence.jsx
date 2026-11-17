import React, { useEffect, useRef, useState } from 'react';
import { Lens } from '../lens/Lens.jsx';
import { BeadThread } from '../editing/BeadThread.jsx';

export const SEQUENCE_STEPS = [
  { title: 'You film it. Awkwardly.', body: 'Three takes, two ums, one long look at the ceiling. Normal.', lens: { shape: 'card', width: 230, grade: 'documentary' } },
  { title: 'We find the good parts.', body: 'Fillers and dead air come out. Every cut says why, so you can put anything back.', lens: { shape: 'card', width: 230, state: 'generating' }, beads: true },
  { title: 'We say it back, clearly.', body: 'Word-timed captions, spelled right. We polish how you said it — never what you said.', lens: { shape: 'edit', aspect: '4:5', width: 320, caption: 'the only ring I wear' } },
  { title: 'From cringe to cinema.', body: 'Graded, paced, scored. Theater mode lets you watch it like you meant it.', lens: { shape: 'circle', width: 340 }, night: true },
];

export function ScrollSequence({ step: ctrl, steps = SEQUENCE_STEPS, scene = 'walnut-lamp', height = '320vh', style }) {
  const ref = useRef(null);
  const [auto, setAuto] = useState(0);
  useEffect(() => {
    if (ctrl != null) return;
    const el = ref.current; if (!el) return;
    const scroller = (n) => { while (n && n !== document.body) { const o = getComputedStyle(n).overflowY; if (o === 'auto' || o === 'scroll') return n; n = n.parentElement; } return window; };
    const sc = scroller(el.parentElement);
    const on = () => { const r = el.getBoundingClientRect(); const vh = sc === window ? window.innerHeight : sc.clientHeight; const top = sc === window ? 0 : sc.getBoundingClientRect().top; const p = Math.min(.999, Math.max(0, (top - r.top) / (r.height - vh))); setAuto(Math.floor(p * steps.length)); };
    on(); sc.addEventListener('scroll', on, { passive: true }); return () => sc.removeEventListener('scroll', on);
  }, [ctrl, steps.length]);
  const i = ctrl ?? auto;
  const s = steps[i];
  return (
    <section ref={ref} data-theme={s.night ? 'night' : undefined} style={{ position: 'relative', height: ctrl != null ? 'auto' : height, background: 'var(--canvas)', color: 'var(--ink)', transition: 'background .6s var(--ease-out), color .6s', ...style }}>
      <div style={{ position: ctrl != null ? 'relative' : 'sticky', top: 0, minHeight: ctrl != null ? 560 : '100vh', display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 340px), 1fr))', alignItems: 'center', gap: 48, padding: '48px clamp(20px, 5vw, 64px)' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20, maxWidth: 440 }}>
          <div style={{ display: 'flex', gap: 6 }}>{steps.map((_, j) => <span key={j} style={{ width: j === i ? 20 : 6, height: 6, borderRadius: 999, background: j === i ? 'var(--ink)' : 'var(--ink-tertiary)', transition: 'width var(--dur-lift) var(--spring)' }} />)}</div>
          <h2 style={{ margin: 0, font: 'var(--type-title)', fontSize: 'clamp(28px, 3.4vw, 44px)', lineHeight: 1.1, letterSpacing: '-0.02em' }}>{s.title}</h2>
          <p style={{ margin: 0, font: 'var(--type-body)', fontSize: 17, lineHeight: '26px', color: 'var(--ink-secondary)' }}>{s.body}</p>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 28, minHeight: 460, justifyContent: 'center' }}>
          <Lens scene={scene} playing {...s.lens} />
          <div style={{ opacity: s.beads ? 1 : 0, transition: 'opacity var(--dur-lift)', height: 90 }}><BeadThread width={380} explain="removed 2 ums · 1 ceiling look · 2.4s" /></div>
        </div>
      </div>
    </section>
  );
}
