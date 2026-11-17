import React from 'react';
import { Lens } from '../lens/Lens.jsx';
import { Button } from '../core/Button.jsx';
import { glass } from '../core/materials.js';

export function IdeaCard({ hook = '3 ways I wear one ring', beats = 3, length = '30s', why = 'you film rings a lot', scene = 'morning-sheets', image, width = 210, onFilm, style }) {
  return (
    <Lens shape="card" width={width} scene={scene} image={image} style={style}>
      <div aria-hidden style={{ position: 'absolute', left: 0, right: 0, top: 0, height: '40%', background: 'linear-gradient(rgba(17,17,17,.38),transparent)' }} />
      <div style={{ position: 'absolute', left: 16, right: 16, top: 18, font: '700 20px/24px var(--font-sans)', color: '#fff', textShadow: 'var(--caption-shadow)', textWrap: 'balance' }}>{hook}</div>
      <div style={{ position: 'absolute', left: 10, right: 10, bottom: 10, ...glass({ padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }) }}>
        <div style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)' }}>{beats} beats · {length} · {why}</div>
        <Button variant="primary" icon="camera" onClick={onFilm} style={{ width: '100%' }}>film this</Button>
      </div>
    </Lens>
  );
}
