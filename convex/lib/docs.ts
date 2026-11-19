import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { applyChange, Change, EditDoc, emptyEditDoc, labelsFromChange } from "@eyelore/core";
import { anonHashOf } from "./entitle";

export async function headDoc(ctx: QueryCtx | MutationCtx, projectId: Id<"projects">): Promise<{ rowId: Id<"editDocs">; doc: EditDoc } | null> {
  const row = await ctx.db.query("editDocs").withIndex("by_project", (q) => q.eq("projectId", projectId)).unique();
  return row ? { rowId: row._id, doc: row.doc as EditDoc } : null;
}

export async function createDoc(ctx: MutationCtx, projectId: Id<"projects">) {
  const doc = emptyEditDoc(projectId);
  await ctx.db.insert("editDocs", { projectId, version: 0, doc });
  return doc;
}

/**
 * Apply changes atomically to the head doc and log each with its reason (ADR 0002).
 * `baseVersion` (user edits) rejects stale writes so concurrent editors rebase instead of overwriting.
 */
export async function commitChanges(
  ctx: MutationCtx,
  projectId: Id<"projects">,
  changes: unknown[],
  baseVersion?: number,
  /** `labels: false` for a user change that is a reversal (undo): it is not a verdict on the autopilot */
  opts: { labels?: boolean } = {},
) {
  const head = await headDoc(ctx, projectId);
  if (!head) throw new Error("no edit doc");
  if (baseVersion !== undefined && baseVersion !== head.doc.version) {
    return { ok: false as const, conflict: true, version: head.doc.version };
  }
  let doc = head.doc;
  const owner = opts.labels === false ? null : await ctx.db.get(projectId);
  const anonHash = owner?.ownerAnonId ? await anonHashOf(owner.ownerAnonId) : undefined;
  const skipped: string[] = [];
  for (const raw of changes) {
    const change = Change.parse(raw);
    const r = applyChange(doc, change);
    if (!r) {
      skipped.push(change.reason);
      continue;
    }
    // labels are read against the doc as it was before this change; autopilot changes yield none
    const labels = owner ? labelsFromChange(doc, change) : [];
    doc = EditDoc.parse(r.doc);
    for (const l of labels) {
      await ctx.db.insert("editLabels", {
        projectId, kind: l.kind, atMs: l.atMs, spanMs: l.spanMs, docVersion: doc.version, at: Date.now(),
        ...(l.strikeKind ? { strikeKind: l.strikeKind } : {}),
        ...(owner!.ownerUserId ? { userId: owner!.ownerUserId } : {}),
        ...(anonHash ? { anonHash } : {}),
      });
    }
    await ctx.db.insert("editOps", { projectId, version: doc.version, ops: r.applied, reason: change.reason, actor: change.actor, at: Date.now() });
  }
  await ctx.db.patch(head.rowId, { doc, version: doc.version });
  await ctx.db.patch(projectId, { headVersion: doc.version });
  return { ok: true as const, version: doc.version, skipped };
}

/** Drop the labels a change wrote (its undo means the person changed their mind, so it was not a verdict after all). */
export async function dropLabelsAt(ctx: MutationCtx, projectId: Id<"projects">, docVersion: number) {
  const rows = await ctx.db.query("editLabels").withIndex("by_project", (q) => q.eq("projectId", projectId).eq("docVersion", docVersion)).take(500);
  for (const r of rows) await ctx.db.delete(r._id);
}
