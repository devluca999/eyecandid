import React from 'react';
import { Logo } from '../core/Logo.jsx';

const COLS = [
  { t: 'product', l: ['web editor', 'mobile app', 'pricing', 'changelog'] },
  { t: 'for', l: ['creators', 'ugc brands', 'students'] },
  { t: 'company', l: ['founder letter', 'privacy', 'terms', 'contact'] },
];

export function Footer({ assetBase = 'assets/', cols = COLS, style }) {
  return (
    <footer style={{ padding: '64px clamp(20px, 5vw, 64px) 40px', display: 'flex', flexDirection: 'column', gap: 48, ...style }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 48 }}>
        <div style={{ flex: '1 1 240px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <Logo height={28} wordmark basePath={assetBase} />
          <span style={{ font: 'var(--type-body)', color: 'var(--ink-secondary)' }}>Making real people look great.</span>
        </div>
        {cols.map((c) => (
          <div key={c.t} style={{ flex: '0 1 140px', display: 'flex', flexDirection: 'column', gap: 10 }}>
            <span style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)' }}>{c.t}</span>
            {c.l.map((x) => <a key={x} href="#" style={{ font: 'var(--type-ui)', color: 'var(--ink)', textDecoration: 'none' }}>{x}</a>)}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12, paddingTop: 20, borderTop: '1px solid var(--hairline)', font: 'var(--type-meta)', color: 'var(--ink-secondary)' }}>
        <span>© 2026 eyecandid</span><span>from cringe to cinema.</span>
      </div>
    </footer>
  );
}
