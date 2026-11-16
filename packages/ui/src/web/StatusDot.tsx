import type { CSSProperties } from "react";

const WORD = { ready: "ready", working: "rendering", attention: "needs you" } as const;
export type Status = keyof typeof WORD;

/** One lowercase word beside a 6px dot. Ported from design/components/status/StatusDot.jsx. */
export function StatusDot({ status = "ready", label, showLabel = true, style }: { status?: Status; label?: string; showLabel?: boolean; style?: CSSProperties }) {
  const word = label ?? WORD[status];
  return (
    <span className="el-status" role="status" aria-label={word} style={style}>
      <span className={"el-dot" + (status !== "ready" ? " el-dot--" + status : "")} />
      {showLabel && word}
    </span>
  );
}
