"use client";
/**
 * The export quality check in the editor (convex/qc.ts, packages/core qcGate.ts), kept out of Editor.tsx:
 *  - a blocked export shows its own one-line reason in the export pill, with the way out that exists ("try again" for
 *    a render fault, "fix" to go to the spot) and "back";
 *  - a held one (the person's own footage or choice) shows the line with "fix" where there is one and "export anyway";
 *  - the safe fixes made before the export show as one quiet line with "put back".
 * Notes are silent here; they're recorded on the export.
 */
import { useCallback, useState } from "react";
import { useMutation } from "convex/react";
import { ConvexError } from "convex/values";
import { api } from "@convex/_generated/api";
import type { Id } from "@convex/_generated/dataModel";
import { qcAction, sourceAt, type QcIssue, type Segment } from "@eyelore/core";
import type { ExportCheck } from "@eyelore/ui";

type ExportQc = { status: "pending" | "ok" | "ask" | "blocked"; issues?: unknown[]; accepted?: boolean; fixed?: string[] } | undefined;
export type DeviceCheck = { kind: "held" | "blocked"; issue: QcIssue; exportId: Id<"exports"> } | null;

/** A pre-render refusal from planExport ({ code: "qc_blocked", ... }), as an issue; anything else is not ours. */
export function refusalIssue(e: unknown): QcIssue | null {
  const d = e instanceof ConvexError ? (e.data as { code?: string; message?: string; atMs?: number; issue?: string }) : undefined;
  if (d?.code !== "qc_blocked") return null;
  return { code: (d.issue ?? "empty") as QcIssue["code"], atMs: d.atMs ?? 0, spanMs: 0, ours: true, gate: "block", message: d.message ?? "this edit can't be exported yet" };
}

export function useExportCheck(o: {
  anonId: string;
  projectId: Id<"projects">;
  latest?: { _id: Id<"exports">; qc?: ExportQc; device: boolean };
  device: DeviceCheck;
  clearDevice: () => void;
  acceptDevice: () => void;
  segments?: Segment[];
  seekSrc: (ms: number) => void;
  again: () => void;
}) {
  const accept = useMutation(api.qc.acceptExport);
  const undoFix = useMutation(api.qc.undoFix);
  const [refusal, setRefusal] = useState<QcIssue | null>(null);
  const [dismissed, setDismissed] = useState<string | null>(null);
  const [fixDone, setFixDone] = useState<string | null>(null);

  const show = useCallback(
    (atMs: number) => {
      const at = o.segments ? sourceAt(o.segments, atMs) : null;
      if (at) o.seekSrc(at.srcMs);
    },
    [o],
  );

  const build = (kind: "held" | "blocked", issue: QcIssue, close: () => void, anyway?: () => void): ExportCheck => {
    const act = qcAction(issue);
    const actions: ExportCheck["actions"] = [];
    if (act === "again") actions.push({ label: "try again", testId: "qc-again", onClick: () => (close(), o.again()) });
    if (act === "show") actions.push({ label: "fix", testId: "qc-fix", onClick: () => (close(), show(issue.atMs)) });
    if (kind === "held" && anyway) actions.push({ label: "export anyway", testId: "qc-anyway", onClick: anyway });
    else actions.push({ label: "back", testId: "qc-back", onClick: close });
    return { kind, text: issue.message, actions };
  };

  let check: ExportCheck | null = null;
  if (refusal) check = build("blocked", refusal, () => setRefusal(null));
  else if (o.device) {
    check = build(o.device.kind, o.device.issue, o.clearDevice, o.device.kind === "held" ? () => {
      void accept({ anonId: o.anonId, exportId: o.device!.exportId }).catch(() => {});
      o.acceptDevice();
    } : undefined);
  } else if (o.latest && !o.latest.device && dismissed !== o.latest._id) {
    const q = o.latest.qc;
    const issues = (q?.issues ?? []) as QcIssue[];
    const id = o.latest._id;
    const close = () => setDismissed(id);
    if (q?.status === "blocked") check = build("blocked", issues.find((i) => i.gate === "block") ?? issues[0]!, close);
    else if (q?.status === "ask" && !q.accepted) check = build("held", issues.find((i) => i.gate === "ask") ?? issues[0]!, close, () => void accept({ anonId: o.anonId, exportId: id }).catch(() => {}));
  }

  const fixes = fixDone !== o.latest?._id ? o.latest?.qc?.fixed ?? [] : [];
  const fixed = fixes.length ? fixes.join(" · ") : null;
  const putBack = () => {
    if (o.latest) setFixDone(o.latest._id);
    void (async () => {
      for (let i = 0; i < fixes.length; i++) await undoFix({ anonId: o.anonId, projectId: o.projectId });
    })().catch(() => {});
  };
  const fixedLine = fixed ? (
    <p className="text-meta text-ink-secondary" style={{ textAlign: "center" }} data-testid="qc-fixed">
      {fixed} ·{" "}
      <button className="el-pill el-pill--quiet el-pill--sm" style={{ padding: "0 6px" }} onClick={putBack} data-testid="qc-putback">
        put back
      </button>
    </p>
  ) : null;

  return { check, fixedLine, setRefusal };
}
