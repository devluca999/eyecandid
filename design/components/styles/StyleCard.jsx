import React from 'react';
import { Footage } from '../footage/Footage.jsx';

/** A style recipe as a looping mini-Lens. anim: punch | whip | ramp | crash | jump | drift. */
export function StyleCard({ name, tag, scene = 'sofa', grade, anim = 'drift', selected = false, onClick }) {
  return (
    <div className={'el-stylecard' + (selected ? ' is-on' : '')} onClick={onClick} role="button" tabIndex={0} aria-pressed={selected}>
      <div className="el-lens el-lens--card el-lens--noglow" data-scene={scene}>
        <div className="el-lens__frame"><div className={'el-anim-' + anim} style={{ position: 'absolute', inset: 0 }}><Footage scene={scene} grade={grade} live={false} /></div></div>
      </div>
      <span className="el-stylecard__name">{name}</span>
      {tag && <span className="el-stylecard__tag">{tag}</span>}
    </div>
  );
}
