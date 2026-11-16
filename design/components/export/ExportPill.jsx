import React from 'react';
import { Icon } from '../icons/Icon.jsx';
import { StatusDot } from '../status/StatusDot.jsx';

/** Inline export: ratio, cutdowns and download. Pair with <Lens progress> for the edge ring. */
export function ExportPill({ ratios = ['9:16', '4:5', '16:9'], value = '9:16', onChange, cutdowns = ['15', '30', '60'], cut, onCut, onExport, phase = 'idle', progress, onDownload, style }) {
  return (
    <div className="el-glass el-export" style={style}>
      {phase === 'done' ? (
        <span className="el-export__msg"><Icon name="link" size={16} />copied link<span className="el-meta">·</span>
          <button className="el-pill el-pill--quiet el-pill--sm" style={{ padding: '0 6px', color: 'var(--ink)' }} onClick={onDownload}>download</button></span>
      ) : (
        <React.Fragment>
          <div className="el-seg" role="radiogroup" aria-label="ratio">
            {ratios.map((r) => <button key={r} className={'el-seg__opt' + (value === r ? ' is-on' : '')} role="radio" aria-checked={value === r} onClick={() => onChange && onChange(r)}>{r}</button>)}
          </div>
          {cutdowns && cutdowns.length > 0 && <span className="el-export__sep" />}
          {cutdowns && cutdowns.length > 0 && (
            <div className="el-seg" role="radiogroup" aria-label="cutdown">
              {cutdowns.map((c) => <button key={c} className={'el-seg__opt' + (cut === c ? ' is-on' : '')} onClick={() => onCut && onCut(cut === c ? null : c)}>{c}s</button>)}
            </div>
          )}
          {phase === 'rendering'
            ? <span className="el-export__msg"><StatusDot status="working" label="rendering" />{progress != null && <span className="el-tc" style={{ color: 'var(--ink-secondary)' }}>{Math.round(progress * 100)}%</span>}</span>
            : <button className="el-export__go" onClick={onExport} aria-label="export"><Icon name="download" /></button>}
        </React.Fragment>
      )}
    </div>
  );
}
