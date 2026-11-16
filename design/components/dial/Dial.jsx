import React from 'react';

/** Rotary dial. Drag vertically (or scroll, or arrow keys) to change. 0–1 value. */
export function Dial({ label, value = 0.5, onChange, low, high, format, size = 44 }) {
  const ref = React.useRef(null);
  const set = (v) => onChange && onChange(Math.max(0, Math.min(1, Math.round(v * 100) / 100)));
  const down = (e) => {
    const y0 = e.clientY, v0 = value;
    e.currentTarget.setPointerCapture(e.pointerId);
    const mv = (ev) => set(v0 + (y0 - ev.clientY) / 160);
    const up = () => { ref.current.removeEventListener('pointermove', mv); ref.current.removeEventListener('pointerup', up); };
    ref.current.addEventListener('pointermove', mv); ref.current.addEventListener('pointerup', up);
  };
  const r = size / 2 - 3, c = 2 * Math.PI * r, arc = 0.75;
  const angle = -135 + value * 270;
  return (
    <div className="el-dial" style={{ width: size + 20 }}>
      <div ref={ref} className="el-dial__knob" style={{ width: size, height: size }} role="slider" tabIndex={0}
        aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}
        onPointerDown={down} onWheel={(e) => set(value - e.deltaY / 800)}
        onKeyDown={(e) => { if (e.key === 'ArrowUp' || e.key === 'ArrowRight') set(value + 0.05); if (e.key === 'ArrowDown' || e.key === 'ArrowLeft') set(value - 0.05); }}>
        <svg viewBox={'0 0 ' + size + ' ' + size}>
          <circle className="el-dial__track" cx={size / 2} cy={size / 2} r={r} strokeDasharray={c * arc + ' ' + c} transform={'rotate(135 ' + size / 2 + ' ' + size / 2 + ')'} />
          <circle className="el-dial__fill" cx={size / 2} cy={size / 2} r={r} strokeDasharray={c * arc * value + ' ' + c} transform={'rotate(135 ' + size / 2 + ' ' + size / 2 + ')'} />
        </svg>
        <div className="el-dial__cap" style={{ transform: 'rotate(' + angle + 'deg)' }} />
      </div>
      <span className="el-dial__label">{label}</span>
      <span className="el-dial__value">{format ? format(value) : (value < 0.34 && low) || (value > 0.66 && high) || Math.round(value * 100)}</span>
    </div>
  );
}
