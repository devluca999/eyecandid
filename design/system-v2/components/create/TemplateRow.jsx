import React from 'react';
import { Lens } from '../lens/Lens.jsx';
import { Button } from '../core/Button.jsx';

const DEFAULT = [
  { name: 'unboxing', beats: 'reveal · close-up · reaction', scene: 'rose-case' },
  { name: 'day in my life', beats: 'morning · gym · night', scene: 'morning-sheets' },
  { name: 'honest review', beats: 'hook · pros · the catch', scene: 'creator-portrait' },
  { name: 'get ready with me', beats: 'before · steps · after', scene: 'walnut-lamp' },
  { name: 'gym proof', beats: 'set · close-up · cta', scene: 'gym-dumbbell' },
];

export function TemplateRow({ title = 'start from a shape', templates = DEFAULT, cardWidth = 132, onPick, onSeeAll, style }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14, ...style }}>
      <div style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ font: 'var(--type-heading)', flex: 1 }}>{title}</span>
        <Button variant="quiet" iconAfter="arrow-right" onClick={onSeeAll}>see all</Button>
      </div>
      <div style={{ display: 'flex', gap: 18, overflowX: 'auto', padding: '8px 4px 24px', margin: '-8px -4px -24px' }}>
        {templates.map((t) => (
          <div key={t.name} style={{ display: 'flex', flexDirection: 'column', gap: 10, width: cardWidth, flex: 'none' }}>
            <Lens shape="card" width={cardWidth} scene={t.scene} image={t.image} onClick={() => onPick && onPick(t.name)} />
            <div>
              <div style={{ font: 'var(--type-ui)' }}>{t.name}</div>
              <div style={{ font: 'var(--type-meta)', color: 'var(--ink-secondary)' }}>{t.beats}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
