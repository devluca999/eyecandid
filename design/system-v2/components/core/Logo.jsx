import React from 'react';

export function Logo({ variant = 'flagship', height = 32, wordmark = false, basePath = 'assets/', style }) {
  const file = height < 48 && variant !== 'inverse' ? 'eyecandid-mark-small.svg' : variant === 'inverse' ? 'eyecandid-mark-inverse.svg' : variant === 'small' ? 'eyecandid-mark-small.svg' : 'eyecandid-mark.svg';
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: height * 0.35, ...style }}>
      <img src={basePath + file} alt={wordmark ? '' : 'eyecandid'} style={{ height, width: 'auto', display: 'block' }} />
      {wordmark && <span style={{ font: `500 ${Math.round(height * 0.62)}px/1 var(--font-sans)`, letterSpacing: '-0.02em', color: variant === 'inverse' ? '#F2F0EA' : '#111111' }}>eyecandid</span>}
    </span>
  );
}
