import React from 'react';
import { Icon } from '../icons/Icon.jsx';
import { Lens } from '../lens/Lens.jsx';

/** Plain-language b-roll search with a carousel of looping results. Drag a result onto the bead thread. */
export function BrollSheet({ query = '', onQuery, results = [], onInsert, onClose, style }) {
  return (
    <div className="el-glass el-sheet el-pop" style={style}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, paddingRight: 20 }}>
        <span style={{ font: 'var(--font-ui)' }}>b-roll</span>
        <span className="el-meta">drag onto the thread, or click to drop at the playhead</span>
        <span style={{ flex: 1 }} />
        <button className="el-iconbtn" onClick={onClose} aria-label="close"><Icon name="x" size={18} /></button>
      </div>
      <label className="el-search">
        <Icon name="search" size={18} />
        <input value={query} onChange={(e) => onQuery && onQuery(e.target.value)} placeholder="describe the shot…" />
      </label>
      <div className="el-carousel">
        {results.map((r, i) => (
          <div key={i} className="el-result" draggable onDragStart={(e) => e.dataTransfer.setData('text/eyelore-broll', JSON.stringify(r))} onClick={() => onInsert && onInsert(r)}>
            <Lens shape="card" width={128} scene={r.scene} grade={r.grade} state={r.source === 'generate' ? 'generating' : 'rest'} interactive glow={false} />
            <span className={'el-tag el-tag--' + r.source}>{r.source}{r.dur ? ' · ' + r.dur : ''}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
