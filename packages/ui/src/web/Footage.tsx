import type { CSSProperties } from "react";

export const SCENES = ["bed", "nightstand", "gym", "case", "sofa", "booth", "void"] as const;
export type Scene = (typeof SCENES)[number];

/** Ported from design/components/footage/Footage.jsx. Photographic stand-in, or a real still/clip via `src`. */
export function Footage({ scene = "sofa", src, grade, live = true, alt = "", style, className = "" }: {
  scene?: Scene; src?: string; grade?: string; live?: boolean; alt?: string; style?: CSSProperties; className?: string;
}) {
  const isVideo = !!src && /\.(mp4|webm|mov)(\?|$)/i.test(src);
  return (
    <div
      className={"el-scene" + (live ? " el-scene--live" : "") + (src ? " has-image" : "") + (className ? " " + className : "")}
      data-scene={scene}
      data-grade={grade}
      style={style}
      role={alt ? "img" : undefined}
      aria-label={alt || undefined}
    >
      {src ? (
        isVideo ? <video className="el-scene__img" src={src} muted loop autoPlay playsInline /> : <img className="el-scene__img" src={src} alt={alt} />
      ) : (
        <>
          <b />
          <i />
        </>
      )}
    </div>
  );
}
