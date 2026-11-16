import React from 'react';
import { Footage } from '../footage/Footage.jsx';

/** Three takes of the same script, aligned by line. Best line per take is marked; picks stitch the result. */
export function TakeMixer({ lines = [], takes = [], picks = [], onPick }) {
  const tones = ['#c89a7a', '#8fa3b8', '#b8a48a'];
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div className="el-mixer" style={{ '--lines': lines.length }}>
        <span />
        {lines.map((l, i) => <span key={i} className="el-mixer__head">{l}</span>)}
        {takes.map((t, ti) => (
          <React.Fragment key={ti}>
            <div className="el-mixer__take">
              <div className="el-lens el-lens--noglow" style={{ width: 28, height: 44, borderRadius: 7 }}><div className="el-lens__frame"><Footage scene={t.scene} grade={t.grade} live={false} /></div></div>
              <span>take {ti + 1}</span>
            </div>
            {lines.map((_, li) => (
              <div key={li} className={'el-mixer__cell' + (t.best === li ? ' is-best' : '') + (picks[li] === ti ? ' is-pick' : '')} onClick={() => onPick && onPick(li, ti)}>
                {t.notes[li]}
              </div>
            ))}
          </React.Fragment>
        ))}
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: '72px 1fr', gap: 8, alignItems: 'center' }}>
        <span className="el-meta">stitched</span>
        <div className="el-mixer__bar">{lines.map((_, li) => <i key={li} style={{ background: tones[picks[li]] || 'var(--hairline)' }} />)}</div>
      </div>
    </div>
  );
}
