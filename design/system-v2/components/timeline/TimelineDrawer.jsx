import React, { useState } from 'react';
import { WeaveTrack } from './WeaveTrack.jsx';
import { Icon } from '../core/Icon.jsx';
import { glass } from '../core/materials.js';

export const DEFAULT_TRACKS = {
  video: [{ start: 0, dur: 7, scene: 'creator-portrait' }, { start: 7, dur: 9, scene: 'morning-sheets' }, { start: 16, dur: 8, scene: 'creator-portrait' }, { start: 24, dur: 9, scene: 'rose-case' }, { start: 33, dur: 7, scene: 'creator-portrait' }],
  broll: [{ start: 12, dur: 3.5, scene: 'walnut-lamp', reason: 'you said ‘nightstand’' }, { start: 27, dur: 3, scene: 'gym-dumbbell', reason: 'you said ‘gym’', attention: true }],
  voice: [{ start: 0.4, dur: 6.2 }, { start: 7.2, dur: 8.4 }, { start: 16.3, dur: 7.2 }, { start: 24.4, dur: 8.2 }, { start: 33.2, dur: 6.4 }],
  music: [{ start: 0.4, dur: 6.2, duck: true }, { start: 7.2, dur: 8.4, duck: true }, { start: 16.3, dur: 7.2, duck: true }, { start: 24.4, dur: 8.2, duck: true }, { start: 33.2, dur: 6.4, duck: true }],
  captions: [{ start: 0.4, dur: 3, text: 'okay so' }, { start: 3.6, dur: 3, text: 'this ring' }, { start: 7.2, dur: 4, text: 'I wear it every' }, { start: 11.4, dur: 4, text: 'day, even at' }, { start: 16.3, dur: 4, text: 'the gym' }, { start: 24.4, dur: 4, text: 'it comes in' }, { start: 28.6, dur: 4, text: 'this little case' }, { start: 33.2, dur: 4, text: 'link below' }],
};
const ORDER = ['video', 'broll', 'voice', 'music', 'captions'];

export function TimelineDrawer({ open: ctrl, onOpenChange, tracks = DEFAULT_TRACKS, duration = 40, playhead = 14.3, exceptions = { broll: 1 }, material = 'glass', style }) {
  const [inner, setInner] = useState(true);
  const open = ctrl ?? inner;
  const toggle = () => { setInner(!open); onOpenChange && onOpenChange(!open); };
  const tc = (s) => `00:${String(Math.floor(s)).padStart(2, '0')}.${String(Math.round((s % 1) * 100)).padStart(2, '0')}`;
  return (
    <div style={{ ...(material === 'paper' ? { background: 'var(--canvas)', border: '1px solid var(--hairline)', borderRadius: 16, boxShadow: 'var(--shadow-lens-rest)', color: 'var(--ink)', overflow: 'hidden' } : glass({ borderRadius: 16, padding: 0, overflow: 'hidden' })), ...style }}>
      <button onClick={toggle} style={{ width: '100%', height: 44, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12, padding: '0 16px', color: 'var(--ink)', whiteSpace: 'nowrap' }}>
        <span style={{ font: 'var(--type-timecode)' }}>{tc(playhead)}</span>
        <span style={{ font: 'var(--type-timecode)', color: 'var(--ink-secondary)' }}>/ {tc(duration)}</span>
        <span style={{ flex: 1 }} />
        <span style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)' }}>5 tracks on autopilot</span>
        <Icon name={open ? 'chevron-down' : 'chevron-up'} size={18} />
      </button>
      <div style={{ display: 'grid', gridTemplateRows: open ? '1fr' : '0fr', transition: 'grid-template-rows var(--dur-morph) var(--spring-soft)' }}>
        <div style={{ overflow: 'hidden' }}>
          <div style={{ padding: '4px 16px 16px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            {ORDER.map((k) => <WeaveTrack key={k} kind={k} clips={tracks[k] || []} duration={duration} playhead={playhead} exceptions={exceptions[k] || 0} />)}
          </div>
        </div>
      </div>
    </div>
  );
}
