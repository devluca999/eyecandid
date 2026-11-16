import React from 'react';
import { Lens } from '../lens/Lens.jsx';

/** A physical stack of takes. Flick the top card sideways to send it to the back; it tilts in 3D as you drag. */
export function TakeStack({ takes = [], index = 0, onChange, width = 150 }) {
  const [drag, setDrag] = React.useState(null);
  const n = takes.length;
  const order = takes.map((_, i) => (i - index + n) % n);
  const down = (e) => { e.currentTarget.setPointerCapture(e.pointerId); setDrag({ x0: e.clientX, dx: 0 }); };
  const move = (e) => drag && setDrag({ ...drag, dx: e.clientX - drag.x0 });
  const up = () => {
    if (!drag) return;
    if (Math.abs(drag.dx) > 60) onChange && onChange((index + (drag.dx < 0 ? 1 : n - 1)) % n);
    setDrag(null);
  };
  return (
    <div className="el-takes" style={{ width: width + 30, height: width * 16 / 9 + 40 }}>
      {takes.map((t, i) => {
        const d = order[i];
        if (d > 3) return null;
        const top = d === 0;
        const dx = top && drag ? drag.dx : 0;
        const tf = top
          ? 'translateX(' + (14 + dx) + 'px) rotate(' + (3 + dx / 14) + 'deg) rotateY(' + (dx / 6) + 'deg)'
          : 'translateX(' + (14 - d * 14) + 'px) translateY(' + d * 3 + 'px) rotate(' + (3 - d * 5.5) + 'deg)';
        return (
          <div key={i} className={'el-take' + (top && drag ? ' is-dragging' : '')}
            style={{ width, zIndex: 10 - d, transform: tf, opacity: 1 - d * 0.1 }}
            onPointerDown={top ? down : undefined} onPointerMove={top ? move : undefined} onPointerUp={top ? up : undefined} onPointerCancel={top ? up : undefined}>
            <Lens shape="card" width={width} scene={t.scene} grade={t.grade} glow={top} />
          </div>
        );
      })}
      <div className="el-takes__meta">
        <span>takes</span><span className="el-tc">{index + 1} / {n}</span>
        <span className="el-takes__dots">{takes.map((_, i) => <i key={i} className={i === index ? 'is-on' : ''} />)}</span>
      </div>
    </div>
  );
}
