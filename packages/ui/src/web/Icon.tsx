import type { CSSProperties } from "react";
import { ICON_PATHS, type IconName } from "../icons.generated";

/** Ported from design/components/icons/Icon.jsx. 1.5px rounded line icons, never filled. */
export function Icon({ name, size = 20, className = "", style, title }: { name: IconName; size?: number; className?: string; style?: CSSProperties; title?: string }) {
  const escaped = title?.replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" })[c]!);
  return (
    <svg
      className={"el-icon " + className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      style={style}
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      dangerouslySetInnerHTML={{ __html: (escaped ? `<title>${escaped}</title>` : "") + ICON_PATHS[name] }}
    />
  );
}
