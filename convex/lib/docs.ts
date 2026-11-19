import type { MutationCtx, QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { applyChange, Change, EditDoc, emptyEditDoc } from "@eyelore/core";
import { recordLabels } from "./labels";

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
 * `labelOwner` (hashed, see lib/labels.ts) is passed only for a person's own edit: it records where the cut was
 * wrong as labels, in this same transaction. Autopilot calls and undo leave it out.
 */
export async function commitChanges(ctx: MutationCtx, projectId: Id<"projects">, changes: unknown[], baseVersion?: number, labelOwner?: string) {
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
    const before = doc;
    doc = EditDoc.parse(r.doc);
    await ctx.db.insert("editOps", { projectId, version: doc.version, ops: r.applied, reason: change.reason, actor: change.actor, at: Date.now() });
    if (labelOwner) await recordLabels(ctx, projectId, before, change, doc.version, labelOwner);
  }
  await ctx.db.patch(head.rowId, { doc, version: doc.version });
  await ctx.db.patch(projectId, { headVersion: doc.version });
  return { ok: true as const, version: doc.version, skipped };
}
