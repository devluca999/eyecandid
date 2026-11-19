import { labelsFromChange } from "@eyelore/core";
import type { Change, EditDoc } from "@eyelore/core";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { anonHashOf } from "./entitle";
import { sha256Hex } from "./workerAuth";

/** One project must not flood the table: past this many labels, a project's further corrections are not stored. */
export const LABEL_CAP = 200;

/** Who made the correction, as a hash: `u:<hash of user id>` signed in, `a:<hash of anon id>` otherwise. Never a raw id. */
export async function labelOwnerOf(who: { userId?: Id<"users">; anonId?: string }): Promise<string | undefined> {
  if (who.userId) return `u:${(await sha256Hex(who.userId)).slice(0, 32)}`;
  if (who.anonId) return `a:${await anonHashOf(who.anonId)}`;
  return undefined;
}

/**
 * Store the labels one user change yields (timings and kinds only). `before` is the doc as it was before the change.
 * Autopilot changes yield none (labelsFromChange). Same transaction as the change itself.
 */
export async function recordLabels(ctx: MutationCtx, projectId: Id<"projects">, before: EditDoc, change: Change, docVersion: number, owner: string) {
  const labels = labelsFromChange(before, change);
  if (!labels.length) return;
  const have = (await ctx.db.query("editLabels").withIndex("by_project", (q) => q.eq("projectId", projectId)).take(LABEL_CAP)).length;
  const at = Date.now();
  for (const l of labels.slice(0, Math.max(0, LABEL_CAP - have))) {
    await ctx.db.insert("editLabels", {
      projectId, kind: l.kind, atMs: l.atMs, spanMs: l.spanMs, ...(l.strikeKind ? { strikeKind: l.strikeKind } : {}), docVersion, at, owner,
    });
  }
}

/** An undone change takes its labels back: the person changed their mind, so the correction was not a verdict. */
export async function dropLabelsAt(ctx: MutationCtx, projectId: Id<"projects">, docVersion: number) {
  const rows = await ctx.db.query("editLabels").withIndex("by_project", (q) => q.eq("projectId", projectId)).take(LABEL_CAP);
  for (const r of rows) if (r.docVersion === docVersion) await ctx.db.delete(r._id);
}
