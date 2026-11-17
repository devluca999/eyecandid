import React, { useEffect, useState } from 'react';
import { Lens } from '../lens/Lens.jsx';
import { DropZone } from '../create/DropZone.jsx';
import { Button } from '../core/Button.jsx';
import { Logo } from '../core/Logo.jsx';

const SHAPES = [
  { shape: 'card', width: 250, caption: null, state: 'rest', label: 'raw' },
  { shape: 'card', width: 250, caption: null, state: 'generating' },
  { shape: 'edit', aspect: '4:5', width: 330, caption: 'the only ring I wear', state: 'rest' },
  { shape: 'circle', width: 340, caption: null, state: 'rest' },
];

export function Hero({ kicker = 'ai video editor for creators and ugc ads', headline = 'Making real people look great.', sub = 'Drop in the awkward take. Get back a captioned, well-paced edit you’d actually post — in about a minute.', assetBase = 'assets/', scene = 'walnut-lamp', onFiles, onCta, nav = true, style }) {
  const [i, setI] = useState(0);
  const [state, setState] = useState('idle');
  useEffect(() => { const t = setInterval(() => setI((n) => (n + 1) % SHAPES.length), 2200); return () => clearInterval(t); }, []);
  const s = SHAPES[i];
  const handle = (f) => { setState('uploading'); onFiles && onFiles(f); setTimeout(() => setState('idle'), 2600); };
  return (
    <section style={{ position: 'relative', padding: '0 clamp(20px, 5vw, 64px)', ...style }}>
      {nav && (
        <nav style={{ height: 72, display: 'flex', alignItems: 'center', gap: 24 }}>
          <Logo height={26} wordmark basePath={assetBase} />
          <span style={{ flex: 1 }} />
          <a href="#how" style={{ font: 'var(--type-ui)', color: 'var(--ink)', textDecoration: 'none', whiteSpace: 'nowrap' }}>how it works</a>
          <a href="#pricing" style={{ font: 'var(--type-ui)', color: 'var(--ink)', textDecoration: 'none', whiteSpace: 'nowrap' }}>pricing</a>
          <Button onClick={onCta}>try it free</Button>
        </nav>
      )}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 380px), 1fr))', gap: 'clamp(32px, 5vw, 64px)', alignItems: 'center', padding: 'clamp(32px, 6vw, 72px) 0' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 24, maxWidth: 560 }}>
          <span style={{ font: 'var(--type-ui)', color: 'var(--ink-secondary)' }}>{kicker}</span>
          <h1 style={{ margin: 0, font: 'var(--type-display)', fontSize: 'clamp(40px, 5.4vw, 72px)', lineHeight: 1.04, letterSpacing: '-0.03em', textWrap: 'balance' }}>{headline}</h1>
          <p style={{ margin: 0, font: 'var(--type-body)', fontSize: 17, lineHeight: '26px', color: 'var(--ink-secondary)', maxWidth: 460, textWrap: 'pretty' }}>{sub}</p>
          <DropZone height={180} state={state === 'uploading' ? 'uploading' : undefined} onFiles={handle} hint="it never leaves your account · mp4, mov" />
        </div>
        <div style={{ height: 480, display: 'grid', placeItems: 'center' }}>
          <Lens shape={s.shape} aspect={s.aspect} width={s.width} scene={scene} state={s.state} caption={s.caption} playing label={s.label} />
        </div>
      </div>
    </section>
  );
}
