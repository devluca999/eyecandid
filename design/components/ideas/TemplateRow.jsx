import React from 'react';
import { GhostCard } from './IdeaCard.jsx';

export const TEMPLATES = [
  { name: 'Problem / Demo / Proof / CTA', beats: ['problem', 'demo', 'proof', 'cta'] },
  { name: 'Day in the life', beats: ['morning', 'midday', 'night', 'cta'] },
  { name: 'Before / after', beats: ['before', 'the change', 'after', 'cta'] },
  { name: 'Unboxing', beats: ['box', 'first look', 'detail', 'on me', 'cta'] },
];

/** A template as a row of ghost beat cards. */
export function TemplateRow({ name, beats = [], onPick, cardWidth = 54 }) {
  return (
    <div className="el-template" onClick={onPick} role="button" tabIndex={0}>
      <span className="el-template__name">{name}</span>
      <div className="el-template__beats">{beats.map((b, i) => <GhostCard key={i} label={b} width={cardWidth} />)}</div>
    </div>
  );
}
