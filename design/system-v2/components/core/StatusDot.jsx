import React from 'react';

const C = { ready: 'var(--status-ready)', working: 'var(--status-working)', attention: 'var(--status-attention)' };
export function StatusDot({ status = 'ready', label, style }) {
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, font: 'var(--type-ui)', color: 'var(--ink)', ...style }}>
      <span aria-hidden style={{ width: 6, height: 6, borderRadius: '50%', background: C[status], animation: status === 'working' ? 'el-pulse 1.4s ease-in-out infinite' : 'none', flex: 'none' }} />
      {label === undefined ? status : label}
    </span>
  );
}
