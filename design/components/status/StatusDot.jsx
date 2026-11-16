import React from 'react';

const WORD = { ready: 'ready', working: 'rendering', attention: 'needs you' };

export function StatusDot({ status = 'ready', label, showLabel = true, style }) {
  const word = label ?? WORD[status];
  return (
    <span className="el-status" role="status" aria-label={word} style={style}>
      <span className={'el-dot' + (status !== 'ready' ? ' el-dot--' + status : '')} />
      {showLabel && word}
    </span>
  );
}
