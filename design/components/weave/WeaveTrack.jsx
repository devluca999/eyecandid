import React from 'react';

/**
 * B-roll track with Weave: the raw b-roll as a faint full-length ribbon; lit windows where it is used.
 * Positions are 0–1 of the duration.
 */
export function WeaveTrack({ windows = [], scenes = ['nightstand', 'bed', 'case', 'gym'], onFace = [], onWindowClick, height = 38 }) {
  const [hover, setHover] = React.useState(-1);
  const strip = (
    <div className="el-strip">
      {scenes.concat(scenes).map((s, i) => <div key={i}><div className="el-scene" data-scene={s}><b /><i /></div></div>)}
    </div>
  );
  return (
    <div className="el-track__lane" style={{ height, overflow: 'visible' }}>
      {onFace.map((f, i) => (
        <div key={'f' + i} className="el-onface" style={{ left: f.start * 100 + '%', width: (f.end - f.start) * 100 + '%', top: -54 }}><span>on face</span></div>
      ))}
      <div className="el-weave-ribbon">{strip}</div>
      {windows.map((w, i) => (
        <div key={i} className="el-weave-win" style={{ left: w.start * 100 + '%', width: (w.end - w.start) * 100 + '%', '--off': -(w.start / (w.end - w.start)) * 100 + '%', '--full': (1 / (w.end - w.start)) * 100 + '%' }}
          onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(-1)} onClick={() => onWindowClick && onWindowClick(i)}>
          {strip}
          {w.pinned && <span className="el-pin"><svg className="el-icon" viewBox="0 0 24 24"><path d="M12 17v5" /><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z" /></svg>pinned</span>}
        </div>
      ))}
      {hover > -1 && windows[hover].why && (
        <div className="el-reason" style={{ left: windows[hover].start * 100 + '%', bottom: 'calc(100% + 8px)' }}>
          <span>{windows[hover].why.split(' · ')[0]} ·</span><b>{windows[hover].why.split(' · ')[1]}</b>
        </div>
      )}
    </div>
  );
}

/** Lay out weave windows from cue points and a density 0–1 (sparse → fast-paced). */
export function weave(cues, density) {
  const n = Math.max(1, Math.round(1 + density * (cues.length - 1)));
  return cues.slice().sort((a, b) => b.score - a.score).slice(0, n).sort((a, b) => a.at - b.at)
    .map((c) => ({ start: c.at, end: Math.min(c.at + 0.06 + (1 - density) * 0.07, 1), why: c.why, pinned: c.pinned }));
}
