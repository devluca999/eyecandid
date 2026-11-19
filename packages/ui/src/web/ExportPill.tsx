"use client";
import type { CSSProperties, MouseEvent } from "react";
import { Icon } from "./Icon";
import { StatusDot } from "./StatusDot";

/**
 * The export quality check's word in the pill: one plain line (the issue's own reason) and the ways out, in place of
 * the controls. `held`: the file is ready but waits for "export anyway"; `blocked`: it isn't delivered.
 */
export type ExportCheck = { kind: "held" | "blocked"; text: string; actions: { label: string; onClick: () => void; testId?: string }[] };

/** design/components/export/ExportPill: ratio, cutdowns and export. Pair with <Lens progress> for the edge ring. */
export function ExportPill({
  ratios = ["9:16", "4:5", "16:9"], value, onChange, cutdowns = ["15", "30", "60"], cut, onCut, onExport, phase = "idle", progress, downloadUrl, filename = "eyecandid.mp4", onDownload, stage, check, style,
}: {
  ratios?: string[]; value: string; onChange: (r: string) => void; cutdowns?: string[]; cut: string | null; onCut: (c: string | null) => void;
  onExport: () => void; phase?: "idle" | "rendering" | "done" | "failed"; progress?: number; downloadUrl?: string | null; filename?: string; onDownload?: (e: MouseEvent<HTMLAnchorElement>) => void; stage?: string; check?: ExportCheck | null; style?: CSSProperties;
}) {
  return (
    <div className="el-glass el-export" style={style} data-testid="export-pill">
      {check ? (
        <span className="el-export__msg" style={{ whiteSpace: "normal" }} data-testid="export-check" data-kind={check.kind}>
          <StatusDot status="attention" label={check.text} />
          {check.actions.map((a) => (
            <button key={a.label} className="el-pill el-pill--quiet el-pill--sm" style={{ padding: "0 6px" }} onClick={a.onClick} data-testid={a.testId}>
              {a.label}
            </button>
          ))}
        </span>
      ) : phase === "done" && downloadUrl ? (
        <span className="el-export__msg">
          <StatusDot status="ready" label="ready" />
          <span className="el-meta">·</span>
          <a className="el-pill el-pill--quiet el-pill--sm" style={{ padding: "0 6px", color: "var(--ink)" }} href={downloadUrl} download={filename} onClick={onDownload} data-testid="download">
            download
          </a>
          <button className="el-pill el-pill--quiet el-pill--sm" style={{ padding: "0 6px" }} onClick={onExport} aria-label="export again">again</button>
        </span>
      ) : (
        <>
          <div className="el-seg" role="radiogroup" aria-label="ratio">
            {ratios.map((r) => (
              <button key={r} className={"el-seg__opt" + (value === r ? " is-on" : "")} role="radio" aria-checked={value === r} onClick={() => onChange(r)}>
                {r}
              </button>
            ))}
          </div>
          {cutdowns.length > 0 && <span className="el-export__sep" />}
          {cutdowns.length > 0 && (
            <div className="el-seg" role="radiogroup" aria-label="cutdown">
              {cutdowns.map((c) => (
                <button key={c} className={"el-seg__opt" + (cut === c ? " is-on" : "")} role="radio" aria-checked={cut === c} onClick={() => onCut(cut === c ? null : c)}>
                  {c}s
                </button>
              ))}
            </div>
          )}
          {phase === "rendering" ? (
            <span className="el-export__msg">
              <StatusDot status="working" label={stage || "rendering"} />
              {progress != null && <span className="el-tc" style={{ color: "var(--ink-secondary)" }}>{Math.round(progress * 100)}%</span>}
            </span>
          ) : (
            <button className="el-export__go" onClick={onExport} aria-label="export" data-testid="export">
              <Icon name="download" />
            </button>
          )}
        </>
      )}
    </div>
  );
}
