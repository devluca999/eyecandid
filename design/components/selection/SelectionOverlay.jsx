import React from 'react';

/**
 * Brush selection over a Lens frame. Paths are arrays of [x,y] in 0–1 frame space.
 * Renders dim-outside + glowing accent outline + marching white edge.
 */
export function SelectionOverlay({ strokes = [], brush = 0.09, mode = 'include', width = 400, height = 700 }) {
  const id = React.useId ? React.useId().replace(/:/g, '') : 'sel';
  const sw = brush * Math.min(width, height);
  const d = strokes.map((s) => s.map(([x, y], i) => (i ? 'L' : 'M') + (x * width).toFixed(1) + ' ' + (y * height).toFixed(1)).join(' ')).join(' ');
  return (
    <div className="el-selection" aria-hidden="true">
      <svg viewBox={'0 0 ' + width + ' ' + height} preserveAspectRatio="none">
        <defs>
          <mask id={'m' + id}>
            <rect width={width} height={height} fill={mode === 'include' ? '#fff' : '#000'} />
            <path d={d} stroke={mode === 'include' ? '#000' : '#fff'} strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </mask>
          <mask id={'o' + id}>
            <rect width={width} height={height} fill="#fff" />
            <path d={d} stroke="#000" strokeWidth={sw} strokeLinecap="round" strokeLinejoin="round" fill="none" />
          </mask>
        </defs>
        <rect className="el-selection__dim" width={width} height={height} mask={'url(#m' + id + ')'} />
        <g mask={'url(#o' + id + ')'}>
          <path className="el-selection__glow" d={d} strokeWidth={sw + 14} />
          <path className="el-selection__edge" d={d} strokeWidth={sw + 3} style={{ stroke: 'var(--accent)', strokeDasharray: 'none', animation: 'none' }} />
        </g>
      </svg>
    </div>
  );
}

/** Rasterises strokes to a mask image (for revealing a result inside the selection). */
export function selectionMaskURL(strokes, brush = 0.09, w = 400, h = 700, invert = false) {
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const x = c.getContext('2d');
  if (invert) { x.fillStyle = '#fff'; x.fillRect(0, 0, w, h); x.globalCompositeOperation = 'destination-out'; }
  x.strokeStyle = '#fff'; x.lineWidth = brush * Math.min(w, h); x.lineCap = x.lineJoin = 'round';
  strokes.forEach((s) => { x.beginPath(); s.forEach(([px, py], i) => (i ? x.lineTo(px * w, py * h) : x.moveTo(px * w, py * h))); x.stroke(); });
  return c.toDataURL();
}
