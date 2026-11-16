import React from 'react';
import { Icon } from '../icons/Icon.jsx';

/** Transcript with word-anchored effects. Select words, describe an effect, it pins to those words. */
export function EffectAnchor({ words = [], now = -1, anchors = [], selection = null, onSelect, onAttach, suggestions = [], style }) {
  const [drag, setDrag] = React.useState(null);
  const inSel = (i) => selection && i >= selection[0] && i <= selection[1];
  const anchorAt = (i) => anchors.find((a) => i >= a.from && i <= a.to);
  return (
    <div style={{ position: 'relative', ...style }}>
      <div className="el-transcript" onPointerUp={() => setDrag(null)}>
        {words.map((w, i) => {
          const a = anchorAt(i);
          return (
            <span key={i} className={(inSel(i) ? 'is-sel ' : '') + (a ? 'is-anchored ' : '') + (i === now ? 'is-now' : '')}
              onPointerDown={() => { setDrag(i); onSelect && onSelect([i, i]); }}
              onPointerEnter={() => drag != null && onSelect && onSelect([Math.min(drag, i), Math.max(drag, i)])}>
              {a && a.from === i && <span className="el-anchorpin"><Icon name="pin" />{a.label}</span>}
              {w}
            </span>
          );
        })}
      </div>
      {selection && !anchors.some((a) => a.from === selection[0]) && (
        <div className="el-glass el-prompt el-pop" style={{ marginTop: 16, width: 380 }}>
          <div className="el-meta">attach an effect to "{words.slice(selection[0], selection[1] + 1).join(' ')}"</div>
          <div className="el-chips">{suggestions.map((s) => <button key={s} className="el-chip" onClick={() => onAttach && onAttach(selection, s)}><Icon name="sparkles" size={14} />{s}</button>)}</div>
        </div>
      )}
    </div>
  );
}
