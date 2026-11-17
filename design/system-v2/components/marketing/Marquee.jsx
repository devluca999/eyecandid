import React from 'react';

export function Marquee({ label = 'proof goes here: real creators after launch', style }) {
  return (
    <section aria-label="social proof placeholder" style={{ padding: '24px clamp(20px, 5vw, 64px)', ...style }}>
      <div style={{ minHeight: 72, borderRadius: 16, background: 'var(--surface-sunken)', boxShadow: 'inset 0 0 0 1px var(--hairline)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '0 24px', textAlign: 'center', flexWrap: 'wrap' }}>
        <span style={{ font: 'var(--type-timecode)', letterSpacing: '.06em', color: 'var(--ink-secondary)' }}>PLACEHOLDER</span>
        <span style={{ font: 'var(--type-body)', color: 'var(--ink-secondary)' }}>{label}</span>
      </div>
    </section>
  );
}
