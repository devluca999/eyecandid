import React from 'react';
import { glass } from './materials.js';

export function Glass({ radius = 16, padding = 16, as = 'div', children, style, ...rest }) {
  return React.createElement(as, { ...rest, style: glass({ borderRadius: radius, padding, ...style }) }, children);
}
