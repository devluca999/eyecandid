import React from 'react';
import { Footage } from '../footage/Footage.jsx';
import { Icon } from '../icons/Icon.jsx';

/**
 * Segments as beads on a hairline thread. Words float above (fillers faint + struck through, click to restore).
 * Bead width ∝ duration; drag the edge handles to trim. AI key moments glow as ticks; click one to loop it.
 */
export function BeadThread({ beads = [], selected, onSelect, onTrim, moments = [], looping, onMoment, momentsOnly = false, onAdd, onRestore, playhead, pxPerSec = 22, style }) {
  const total = beads.reduce((s, b) => s + b.dur, 0) || 1;
  const startAt = (i) => beads.slice(0, i).reduce((s, b) => s + b.dur, 0);
  const trim = (i, side) => (e) => {
    e.stopPropagation();
    const x0 = e.clientX, d0 = beads[i].dur;
    const mv = (ev) => onTrim && onTrim(i, Math.max(0.6, d0 + ((ev.clientX - x0) / pxPerSec) * (side === 'r' ? 1 : -1)));
    const up = () => { window.removeEventListener('pointermove', mv); window.removeEventListener('pointerup', up); };
    window.addEventListener('pointermove', mv); window.addEventListener('pointerup', up);
  };
  const isMoment = (i) => moments.some((m) => m.bead === i);
  return (
    <div className="el-thread" style={style}>
      <div className="el-thread__beads">
        <div className="el-thread__line" style={{ top: '50%' }} />
        {beads.map((b, i) => (
          <React.Fragment key={b.id ?? i}>
            {i > 0 && <div className="el-gap"><button className="el-gap__add" onClick={() => onAdd && onAdd(i)} aria-label="add between"><Icon name="plus" /></button></div>}
            <div className={'el-bead' + (selected === i ? ' is-selected' : '') + (selected != null && selected !== i ? ' is-receded' : '') + (momentsOnly && !isMoment(i) ? ' is-hidden' : '')}
              style={{ width: Math.max(44, b.dur * pxPerSec) }} onClick={() => onSelect && onSelect(i)}>
              <div className="el-bead__frame"><Footage scene={b.scene} grade={b.grade} live={false} /></div>
              <span className="el-bead__trim el-bead__trim--l" onPointerDown={trim(i, 'l')} />
              <span className="el-bead__trim el-bead__trim--r" onPointerDown={trim(i, 'r')} />
              <span className="el-bead__words">{(b.words || []).map((w, wi) => w.filler
                ? <span key={wi} className={'el-filler' + (w.restored ? ' is-restored' : '')} onClick={(e) => { e.stopPropagation(); onRestore && onRestore(i, wi); }}>{w.text}</span>
                : <span key={wi}>{w.text}</span>)}</span>
              <span className="el-bead__tc">{formatTime(startAt(i))}</span>
              {moments.filter((m) => m.bead === i).map((m) => (
                <span key={m.label} className={'el-moment' + (looping === m.label ? ' is-looping' : '')} style={{ left: (m.at ?? 0.3) * 100 + '%' }} onClick={(e) => { e.stopPropagation(); onMoment && onMoment(m); }}><span>{m.label}</span></span>
              ))}
            </div>
          </React.Fragment>
        ))}
        {playhead != null && <div className="el-playhead" style={{ left: (playhead / total) * 100 + '%' }} />}
      </div>
    </div>
  );
}
function formatTime(s) { return Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0'); }
