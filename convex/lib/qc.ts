import type { Doc } from "../_generated/dataModel";

/**
 * Whether the person may have an export's file (convex/qc.ts): delivered, or held and accepted with "export anyway".
 * Exports from before the quality check (no `qc`) are delivered as they always were; "pending" is a finished render
 * whose check hasn't run yet (a moment), so it isn't handed over yet either.
 */
export function delivered(qc: Doc<"exports">["qc"]): boolean {
  return !qc || qc.status === "ok" || (qc.status === "ask" && !!qc.accepted);
}
