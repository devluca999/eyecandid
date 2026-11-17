import React, { useState } from 'react';
import { Button } from '../core/Button.jsx';
import { Icon } from '../core/Icon.jsx';

const TIERS = [
  { id: 'free', name: 'free', m: 0, y: 0, line: 'for trying it on one video', cta: 'start free', features: ['3 edits a month', 'auto captions', 'eyecandid watermark'] },
  { id: 'creator', name: 'creator', m: 19, y: 15, line: 'for posting every week', cta: 'go creator', featured: true, features: ['unlimited edits', 'b-roll matching', 'teleprompter + takes', 'no watermark · 4k export'] },
  { id: 'studio', name: 'studio', m: 49, y: 39, line: 'for brands running ugc', cta: 'go studio', features: ['everything in creator', '5 seats + shared styles', 'brand kit + safe music', 'bulk export to ad sizes'] },
];

export function PricingTable({ yearly: ctrlY, student: ctrlS, onChoose, style }) {
  const [yI, setY] = useState(true);
  const [sI, setS] = useState(false);
  const yearly = ctrlY ?? yI, student = ctrlS ?? sI;
  const price = (t) => { let p = yearly ? t.y : t.m; if (student && p) p = Math.round(p / 2); return p; };
  const Seg = ({ on, children, onClick }) => <button onClick={onClick} style={{ height: 36, padding: '0 16px', borderRadius: 999, border: 'none', cursor: 'pointer', font: 'var(--type-ui)', background: on ? 'var(--surface-raised)' : 'transparent', color: on ? 'var(--ink)' : 'var(--ink-secondary)', boxShadow: on ? 'var(--shadow-lens-rest)' : 'none', transition: 'background var(--dur-quick)' }}>{children}</button>;
  return (
    <section id="pricing" style={{ padding: 'clamp(48px, 8vw, 96px) clamp(20px, 5vw, 64px)', display: 'flex', flexDirection: 'column', gap: 32, alignItems: 'center', ...style }}>
      <span style={{ font: 'var(--type-timecode)', letterSpacing: '.06em', color: 'var(--status-attention)' }}>PLACEHOLDER PRICING · NOT FINAL</span>
      <h2 style={{ margin: 0, font: 'var(--type-title)', fontSize: 'clamp(28px, 3.4vw, 44px)', letterSpacing: '-0.02em', textAlign: 'center' }}>Cheaper than a reshoot.</h2>
      <div style={{ display: 'flex', gap: 16, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'center' }}>
        <div style={{ display: 'inline-flex', padding: 4, borderRadius: 999, background: 'var(--surface-sunken)' }}>
          <Seg on={!yearly} onClick={() => setY(false)}>monthly</Seg><Seg on={yearly} onClick={() => setY(true)}>yearly · save 20%</Seg>
        </div>
        <button onClick={() => setS(!student)} style={{ height: 44, display: 'flex', alignItems: 'center', gap: 10, border: 'none', background: 'transparent', cursor: 'pointer', font: 'var(--type-ui)', color: 'var(--ink)' }}>
          <span style={{ width: 36, height: 22, borderRadius: 999, background: student ? 'var(--ink)' : 'var(--hairline)', position: 'relative', transition: 'background var(--dur-quick)' }}><span style={{ position: 'absolute', top: 3, left: student ? 17 : 3, width: 16, height: 16, borderRadius: '50%', background: 'var(--surface-raised)', boxShadow: '0 1px 2px rgba(17,17,17,.2)', transition: 'left var(--dur-lift) var(--spring)' }} /></span>
          student · 50% off
        </button>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(min(100%, 260px), 1fr))', gap: 16, width: '100%', maxWidth: 980 }}>
        {TIERS.map((t) => (
          <div key={t.id} style={{ padding: 28, borderRadius: 20, display: 'flex', flexDirection: 'column', gap: 18, background: t.featured ? 'var(--surface-raised)' : 'transparent', boxShadow: t.featured ? 'var(--shadow-lens-rest)' : 'none' }}>
            <div><div style={{ font: 'var(--type-heading)' }}>{t.name}</div><div style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)', marginTop: 2 }}>{t.line}</div></div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}><span style={{ font: 'var(--type-display)', letterSpacing: '-0.02em' }}>${price(t)}</span><span style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)' }}>{t.m ? (yearly ? '/ mo, billed yearly' : '/ mo') : 'forever'}</span></div>
            <span style={{ font: 'var(--type-timecode)', letterSpacing: '.06em', color: 'var(--ink-secondary)', marginTop: -12 }}>PLACEHOLDER</span>
            <Button variant={t.featured ? 'primary' : 'quiet'} onClick={() => onChoose && onChoose(t.id)} style={t.featured ? {} : { boxShadow: 'inset 0 0 0 1px var(--hairline)' }}>{t.cta}</Button>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>{t.features.map((f) => <div key={f} style={{ display: 'flex', gap: 10, font: 'var(--type-body)' }}><Icon name="check" size={18} style={{ marginTop: 2, color: 'var(--ink-secondary)' }} />{f}</div>)}</div>
          </div>
        ))}
      </div>
      <div style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)' }}>student pricing with any school email · cancel anytime</div>
    </section>
  );
}
