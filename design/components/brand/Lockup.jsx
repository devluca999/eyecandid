import React from 'react';

/** Mark + lowercase Geist Medium wordmark. Gap = 0.35× mark height; wordmark x-height ≈ mark height / 1.1. */
export function Lockup({ height = 20, theme = 'paper', wordmark = true, base = '', style }) {
  const small = height < 32;
  const file = 'eyelore-mark' + (small ? '-small' : '') + (theme === 'night' ? '-inverse' : '') + '.svg';
  return (
    <span className="el-lockup" style={{ '--h': height + 'px', color: theme === 'night' ? '#F2F0EA' : '#111111', ...style }}>
      <img src={base + 'assets/logo/' + file} alt={wordmark ? '' : 'eyelore'} />
      {wordmark && <span>eyelore</span>}
    </span>
  );
}
