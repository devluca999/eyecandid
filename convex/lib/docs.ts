import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { applyChange, Change, EditDoc, emptyEditDoc } from "@eyelore/core";

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
export async function commitChanges(ctx: MutationCtx, projectId: Id<"projects">, changes: unknown[], baseVersion?: number) {
  const head = await headDoc(ctx, projectId);
  if (!head) throw new Error("no edit doc");
  if (baseVersion !== undefined && baseVersion !== head.doc.version) {
    return { ok: false as const, conflict: true, version: head.doc.version };
  }
  let doc = head.doc;
  const skipped: string[] = [];
  for (const raw of changes) {
    const change = Change.parse(raw);
    const r = applyChange(doc, change);
    if (!r) {
      skipped.push(change.reason);
      continue;
    }
    doc = EditDoc.parse(r.doc);
    await ctx.db.insert("editOps", { projectId, version: doc.version, ops: r.applied, reason: change.reason, actor: change.actor, at: Date.now() });
  }
  await ctx.db.patch(head.rowId, { doc, version: doc.version });
  await ctx.db.patch(projectId, { headVersion: doc.version });
  return { ok: true as const, version: doc.version, skipped };
}
