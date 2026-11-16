import React from 'react';
import { Icon } from '../icons/Icon.jsx';

export const ADD_ITEMS = [
  { id: 'voice', icon: 'mic', label: 'voice' },
  { id: 'broll', icon: 'film', label: 'b-roll' },
  { id: 'grade', icon: 'palette', label: 'grade' },
  { id: 'music', icon: 'music', label: 'music' },
  { id: 'text', icon: 'type', label: 'text' },
];

/** The one-gesture '+' between beads. */
export function AddMenu({ onPick, items = ADD_ITEMS, style }) {
  return (
    <div className="el-glass el-addmenu el-pop" role="menu" style={style}>
      {items.map((it) => (
        <button key={it.id} className="el-addmenu__item" role="menuitem" onClick={() => onPick && onPick(it.id)}>
          <Icon name={it.icon} /><span>{it.label}</span>
        </button>
      ))}
    </div>
  );
}

/** Grade swatches of the current frame + a reference drop. */
export function GradeSwatches({ scene = 'sofa', value, onPick, looks = ['natural', 'warm', 'golden', 'film', 'clean', 'moody'], onReference }) {
  return (
    <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
      {looks.map((g) => (
        <div key={g} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
          <button className={'el-swatch' + (value === g ? ' is-on' : '')} onClick={() => onPick && onPick(g)} aria-label={g}>
            <div className="el-scene" data-scene={scene} data-grade={g === 'natural' ? undefined : g}><b /><i /></div>
          </button>
          <span className="el-swatchlabel">{g}</span>
        </div>
      ))}
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
        <button className="el-ghost" style={{ width: 56, height: 56, alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }} onClick={onReference}><Icon name="upload" size={18} /></button>
        <span className="el-swatchlabel">drop a reference</span>
      </div>
    </div>
  );
}
