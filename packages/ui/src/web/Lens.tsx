import type { CSSProperties, MouseEventHandler, ReactNode } from "react";
import { Footage, type Scene } from "./Footage";

const SIZE = { circle: 280, rect: 480, card: 180 } as const;
export type LensShape = keyof typeof SIZE;

/**
 * The core object: one video window that changes shape — theater circle, editing rectangle at the clip's
 * true aspect ratio, storyboard card. Ported from design/components/lens/Lens.jsx.
 */
export function Lens({
  shape = "rect", state = "rest", aspect = "16 / 9", width, scene = "sofa", src, grade, caption, timecode, meta,
  progress, receded = false, interactive = false, glow = true, onClick, onContextMenu, style, children, label,
}: {
  shape?: LensShape; state?: "rest" | "hover" | "selected" | "generating"; aspect?: string; width?: number | string;
  scene?: Scene; src?: string; grade?: string; caption?: ReactNode; timecode?: string; meta?: ReactNode;
  progress?: number | null; receded?: boolean; interactive?: boolean; glow?: boolean;
  onClick?: MouseEventHandler; onContextMenu?: MouseEventHandler; style?: CSSProperties; children?: ReactNode; label?: string;
}) {
  const w = width ?? SIZE[shape];
  const cls = ["el-lens", "el-lens--" + shape, state === "hover" && "is-hover", state === "selected" && "is-selected",
    receded && "is-receded", interactive && "el-lens--interactive", !glow && "el-lens--noglow"].filter(Boolean).join(" ");
  const ar = shape === "circle" ? "1 / 1" : shape === "card" ? "9 / 16" : aspect;
  const p = progress == null ? null : Math.max(0, Math.min(1, progress));
  return (
    <div className={cls} data-scene={scene} style={{ width: w, aspectRatio: ar, ...style }} onClick={onClick} onContextMenu={onContextMenu}
      role={label ? "img" : undefined} aria-label={label}>
      <div className="el-lens__frame">
        <Footage scene={scene} src={src} grade={grade} />
        {caption && <div className="el-caption">{caption}</div>}
        {(timecode || meta) && (
          <div className="el-lens__meta">
            {timecode ? <span className="el-onvideo el-tc">{timecode}</span> : <span />}
            {meta}
          </div>
        )}
        {state === "generating" && <div className="el-shimmer" />}
        {children}
      </div>
      {p != null && (
        <svg className="el-ring" aria-hidden="true">
          {shape === "circle" ? (
            <circle style={{ cx: "50%", cy: "50%", r: "calc(50% - 1.5px)", transform: "rotate(-90deg)", transformOrigin: "center", transformBox: "fill-box" } as CSSProperties}
              pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
          ) : (
            <rect style={{ x: 1.5, y: 1.5, width: "calc(100% - 3px)", height: "calc(100% - 3px)", rx: 22 } as CSSProperties}
              pathLength={1} strokeDasharray={1} strokeDashoffset={1 - p} />
          )}
        </svg>
      )}
    </div>
  );
}
