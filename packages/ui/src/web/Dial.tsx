"use client";
import { useRef } from "react";

/** design/components/dial/Dial: drag vertically, scroll, or arrow keys. 0–1. */
export function Dial({ label, value, onChange, low, high, size = 44 }: { label: string; value: number; onChange: (v: number) => void; low?: string; high?: string; size?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const set = (v: number) => onChange(Math.max(0, Math.min(1, Math.round(v * 100) / 100)));
  const down = (e: React.PointerEvent<HTMLDivElement>) => {
    const y0 = e.clientY;
    const v0 = value;
    const el = ref.current!;
    el.setPointerCapture(e.pointerId);
    const mv = (ev: PointerEvent) => set(v0 + (y0 - ev.clientY) / 160);
    const up = () => {
      el.removeEventListener("pointermove", mv);
      el.removeEventListener("pointerup", up);
    };
    el.addEventListener("pointermove", mv);
    el.addEventListener("pointerup", up);
  };
  const r = size / 2 - 3;
  const c = 2 * Math.PI * r;
  const arc = 0.75;
  return (
    <div className="el-dial" style={{ width: size + 20 }}>
      <div ref={ref} className="el-dial__knob" style={{ width: size, height: size }} role="slider" tabIndex={0} aria-label={label}
        aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}
        onPointerDown={down} onWheel={(e) => set(value - e.deltaY / 800)}
        onKeyDown={(e) => {
          if (e.key === "ArrowUp" || e.key === "ArrowRight") set(value + 0.05);
          if (e.key === "ArrowDown" || e.key === "ArrowLeft") set(value - 0.05);
        }}>
        <svg viewBox={`0 0 ${size} ${size}`}>
          <circle className="el-dial__track" cx={size / 2} cy={size / 2} r={r} strokeDasharray={`${c * arc} ${c}`} transform={`rotate(135 ${size / 2} ${size / 2})`} />
          <circle className="el-dial__fill" cx={size / 2} cy={size / 2} r={r} strokeDasharray={`${c * arc * value} ${c}`} transform={`rotate(135 ${size / 2} ${size / 2})`} />
        </svg>
        <div className="el-dial__cap" style={{ transform: `rotate(${-135 + value * 270}deg)` }} />
      </div>
      <span className="el-dial__label">{label}</span>
      <span className="el-dial__value">{(value < 0.34 && low) || (value > 0.66 && high) || Math.round(value * 100)}</span>
    </div>
  );
}
