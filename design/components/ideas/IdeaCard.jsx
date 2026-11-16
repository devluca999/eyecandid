import React from 'react';

/** One answer from the idea engine: an angle, a hook critique, or a risk. */
export function IdeaCard({ kicker, line, why, onClick, style, children }) {
  return (
    <div className="el-idea el-pop" onClick={onClick} style={style} role={onClick ? 'button' : undefined} tabIndex={onClick ? 0 : undefined}>
      {kicker && <span className="el-idea__kicker">{kicker}</span>}
      <span className="el-idea__line">{line}</span>
      {why && <span className="el-idea__why">{why}</span>}
      {children}
    </div>
  );
}

/** A ghost beat card — the shape of a shot that doesn't exist yet. */
export function GhostCard({ label, width = 72, style }) {
  return <div className="el-ghost" style={{ width, aspectRatio: '9 / 16', ...style }}><span className="el-ghost__label">{label}</span></div>;
}
