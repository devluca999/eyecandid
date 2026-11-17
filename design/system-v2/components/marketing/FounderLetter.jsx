import React from 'react';
import { Lens } from '../lens/Lens.jsx';

const BODY = [
  'I made my first product video in a parked car, on the fourth try, holding my breath so the phone wouldn’t shake. It was fine. I hated it.',
  'Most people who sell things online aren’t actors. They’re makers and shop owners and people who are good at one thing — and now they’re also supposed to be good on camera.',
  'Eyecandid doesn’t make you someone else. It keeps your words, your face and your laugh, and quietly fixes everything around them: the pauses, the shaky start, the caption typo. Real people, looking great.',
];

export function FounderLetter({ greeting = 'A note before you film anything', body = BODY, name = '[founder name]', role = 'founder, eyecandid', scene = 'creator-portrait', image, style }) {
  return (
    <section style={{ padding: 'clamp(48px, 8vw, 96px) clamp(20px, 5vw, 64px)', display: 'flex', justifyContent: 'center', ...style }}>
      <article style={{ maxWidth: 600, display: 'flex', flexDirection: 'column', gap: 20 }}>
        <span style={{ font: 'var(--type-timecode)', letterSpacing: '.06em', color: 'var(--status-attention)' }}>PLACEHOLDER LETTER · REPLACE WITH THE FOUNDER’S OWN WORDS</span>
        <span style={{ font: 'var(--type-ui)', color: 'var(--ink-secondary)' }}>{greeting}</span>
        {body.map((p, i) => <p key={i} style={{ margin: 0, font: i === 0 ? 'var(--type-heading)' : 'var(--type-body)', fontSize: i === 0 ? 22 : 17, lineHeight: i === 0 ? '30px' : '27px', color: 'var(--ink)', textWrap: 'pretty' }}>{p}</p>)}
        <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginTop: 12 }}>
          <Lens shape="circle" width={52} scene={scene} image={image} glow={false} />
          <div><div style={{ font: 'var(--type-ui)' }}>{name}</div><div style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)' }}>{role}</div></div>
        </div>
      </article>
    </section>
  );
}
