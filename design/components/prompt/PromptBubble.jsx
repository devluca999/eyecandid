import React from 'react';
import { Icon } from '../icons/Icon.jsx';

/** Select-and-talk glass bubble. listening=true shows a live waveform and the transcript as it is spoken. */
export function PromptBubble({ mode = 'include', onModeChange, subject = '1 subject', value, defaultValue = '', placeholder = 'say what to change…', listening = false, level = 0, onMic, reference, onAttach, suggestions = [], onSuggestion, onSubmit, style }) {
  const [v, setV] = React.useState(defaultValue);
  const [bars, setBars] = React.useState(() => Array(48).fill(0.1));
  const val = value ?? v;
  React.useEffect(() => {
    if (!listening) return;
    const t = setInterval(() => setBars((b) => b.slice(1).concat(Math.max(0.08, Math.min(1, level || Math.random() * 0.9 + 0.1)))), 70);
    return () => clearInterval(t);
  }, [listening, level]);
  const submit = (e) => { e.preventDefault(); onSubmit && onSubmit(val, mode); };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10, width: 420, maxWidth: '100%', ...style }}>
      <form className="el-glass el-prompt el-pop" onSubmit={submit}>
        <div className="el-prompt__row">
          <div className="el-seg" role="radiogroup" aria-label="selection mode">
            {['include', 'exclude'].map((m) => <button key={m} type="button" role="radio" aria-checked={mode === m} className={'el-seg__opt' + (mode === m ? ' is-on' : '')} onClick={() => onModeChange && onModeChange(m)}>{m}</button>)}
          </div>
          <span style={{ flex: 1 }} />
          <span className="el-status"><span className="el-dot el-dot--working" style={{ animation: 'none' }} />{subject}</span>
        </div>
        {listening
          ? <div className="el-prompt__text">{val || <span style={{ color: 'var(--ink-tertiary)' }}>listening…</span>}<span className="el-caret" /></div>
          : <input className="el-prompt__field" value={val} placeholder={placeholder} onChange={(e) => setV(e.target.value)} aria-label="prompt" autoFocus />}
        <div className="el-prompt__row">
          <button type="button" className="el-chromebtn" onClick={onAttach} aria-label="attach a reference image"><Icon name="paperclip" size={16} /></button>
          <button type="button" className={'el-chromebtn' + (listening ? ' is-on' : '')} onClick={onMic} aria-label="speak"><Icon name="mic" size={16} /></button>
          {listening ? <div className="el-livewave">{bars.map((b, i) => <i key={i} style={{ height: Math.round(b * 26) + 'px' }} />)}</div> : <span style={{ flex: 1 }}>{reference && <span className="el-prompt__ref"><i><span className="el-scene" data-scene={reference.scene}><b /><i /></span></i>{reference.name}</span>}</span>}
          <span className="el-kbd">↵</span>
          <button type="submit" className="el-prompt__send" aria-label="run"><Icon name="arrow-up" size={18} /></button>
        </div>
      </form>
      {suggestions.length > 0 && <div className="el-chips">{suggestions.map((s) => <button key={s} type="button" className="el-chip" onClick={() => (onSuggestion ? onSuggestion(s) : setV(s))}>{s}</button>)}</div>}
    </div>
  );
}
