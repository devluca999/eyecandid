import React from 'react';
import { Footage } from '../footage/Footage.jsx';
import { WeaveTrack } from '../weave/WeaveTrack.jsx';
import { Dial } from '../dial/Dial.jsx';

export const TRACKS = ['video', 'b-roll', 'voice', 'music', 'captions'];

function bars(n, seed, talk) {
  const out = [];
  for (let i = 0; i < n; i++) { const t = i / n; const on = !talk || talk.some(([a, b]) => t > a && t < b); const v = Math.abs(Math.sin(i * 0.9 + seed) * Math.sin(i * 0.23) + Math.sin(i * 2.7) * 0.3); out.push(on ? 0.15 + v * 0.8 : 0.06); }
  return out;
}

/** Glass drawer with five tracks in fixed order. Weave lives on the b-roll track with a density dial in the header. */
export function TimelineDrawer({ clips = [], windows = [], onFace = [], captions = [], density = 0.4, onDensity, playhead = 0.3, timecode = '00:04.60', duration = '00:15.00', talk = [[0, .44], [.46, .58], [.74, .84]], style }) {
  const voice = React.useMemo(() => bars(160, 1, talk), [talk]);
  const music = React.useMemo(() => bars(140, 4), []);
  return (
    <div className="el-glass el-drawer" style={style}>
      <div className="el-drawer__grip" />
      <div className="el-drawer__head">
        <span style={{ font: 'var(--font-ui)' }}>timeline</span><span className="el-kbd">⌥T</span>
        <span style={{ flex: 1 }} />
        <span className="el-tc">{timecode} <span style={{ color: 'var(--ink-secondary)' }}>/ {duration}</span></span>
        <span style={{ flex: 1 }} />
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><span>weave</span><Dial label="" value={density} onChange={onDensity} size={30} format={(v) => v < .34 ? 'sparse' : v > .66 ? 'fast-paced' : Math.round(v * 100) + '%'} /></span>
      </div>
      <div className="el-tracks" style={{ paddingTop: 18 }}>
        <span className="el-track__name">video</span>
        <div className="el-track__lane" style={{ height: 44 }}>
          {onFace.map((f, i) => <div key={i} className="el-onface" style={{ left: f.start * 100 + '%', width: (f.end - f.start) * 100 + '%' }}><span>on face</span></div>)}
          {clips.map((c, i) => <div key={i} className="el-clip" style={{ left: 'calc(' + c.start * 100 + '% + 1px)', width: 'calc(' + (c.end - c.start) * 100 + '% - 2px)' }}><Footage scene={c.scene} live={false} /><span className="el-clip__name">{c.name}</span></div>)}
        </div>
        <span className="el-track__name">b-roll</span>
        <WeaveTrack windows={windows} />
        <span className="el-track__name">voice</span>
        <div className="el-track__lane" style={{ height: 30 }}><div className="el-wave">{voice.map((h, i) => <i key={i} style={{ height: Math.round(h * 24) }} />)}</div></div>
        <span className="el-track__name">music</span>
        <div className="el-track__lane" style={{ height: 22 }}><div className="el-wave el-wave--music">{music.map((h, i) => <i key={i} style={{ height: Math.round(h * 14) }} />)}</div></div>
        <span className="el-track__name">captions</span>
        <div className="el-track__lane el-track__lane--short">{captions.map((c, i) => <span key={i} className="el-capword" style={{ left: c.at * 100 + '%' }}>{c.text}</span>)}</div>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: 88, right: 0, pointerEvents: 'none' }}><div className="el-playhead" style={{ left: playhead * 100 + '%' }} /></div>
      </div>
    </div>
  );
}
