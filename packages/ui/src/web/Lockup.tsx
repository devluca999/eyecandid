import type { CSSProperties } from "react";

/**
 * Mark + lowercase Geist Medium wordmark. Gap = 0.35x mark height. The marks are the exact vectors in brand/,
 * served by the app at `${base}/brand/…` — never redrawn. Small cut below 32px.
 */
export function Lockup({ height = 20, theme = "paper", wordmark = true, base = "", style }: { height?: number; theme?: "paper" | "night"; wordmark?: boolean; base?: string; style?: CSSProperties }) {
  const small = height < 32;
  const file = "eyelore-mark" + (small ? "-small" : "") + (theme === "night" ? "-inverse" : "") + ".svg";
  return (
    <span className="el-lockup" style={{ ["--h" as string]: height + "px", color: theme === "night" ? "#F2F0EA" : "#111111", ...style }}>
      <img src={`${base}/brand/${file}`} alt={wordmark ? "" : "eyelore"} />
      {wordmark && <span>eyelore</span>}
    </span>
  );
}
