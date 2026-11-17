import React from 'react';
import { ICONS } from './iconData.js';

export function Icon({ name, size = 20, strokeWidth = 1.5, color = 'currentColor', style, title }) {
  const inner = ICONS[name] || ICONS['circle'];
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth * 24 / 20}
      strokeLinecap="round" strokeLinejoin="round" aria-hidden={title ? undefined : true} role={title ? 'img' : undefined}
      style={{ flex: 'none', display: 'block', ...style }} dangerouslySetInnerHTML={{ __html: (title ? '<title>' + title + '</title>' : '') + inner }} />
  );
}
export const ICON_NAMES = Object.keys(ICONS);
