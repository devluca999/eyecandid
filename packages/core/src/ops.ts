import { z } from "zod";
import type { EditDoc } from "./editModel";

/**
 * Reversible operations on the edit document. Paths are JSON pointers (RFC 6901),
 * with ids allowed in place of array indices: "/beads/@b3/struck" addresses the bead whose id is b3.
 */
export const EditOp = z.discriminatedUnion("op", [
  z.object({ op: z.literal("set"), path: z.string(), value: z.unknown(), prev: z.unknown().optional() }),
  z.object({ op: z.literal("insert"), path: z.string(), value: z.unknown() }),
  z.object({ op: z.literal("remove"), path: z.string(), prev: z.unknown().optional() }),
]);
export type EditOp = z.infer<typeof EditOp>;

export const Actor = z.union([z.literal("user"), z.string().regex(/^autopilot:[a-z_]+$/)]);
export type Actor = z.infer<typeof Actor>;

/** A one-line reason in the design system's `action · reason` form, lowercase. */
export const Reason = z
  .string()
  .min(1)
  .max(120)
  .refine((s) => !s.includes("\n"), "one line");

export const Change = z.object({
  ops: z.array(EditOp).min(1),
  reason: Reason,
  actor: Actor,
});
export type Change = z.infer<typeof Change>;

export class OpError extends Error {}

type Container = Record<string, unknown> | unknown[];

function decode(seg: string) {
  return seg.replace(/~1/g, "/").replace(/~0/g, "~");
}

function splitPath(path: string): string[] {
  if (!path.startsWith("/")) throw new OpError(`path must start with /: ${path}`);
  return path.slice(1).split("/").map(decode);
}

function resolveIndex(arr: unknown[], seg: string, forInsert: boolean): number {
  if (seg.startsWith("@")) {
    const id = seg.slice(1);
    const i = arr.findIndex((x) => typeof x === "object" && x !== null && (x as { id?: unknown }).id === id);
    if (i < 0) throw new OpError(`no item with id ${id}`);
    return i;
  }
  if (seg === "-" && forInsert) return arr.length;
  const n = Number(seg);
  if (!Number.isInteger(n) || n < 0 || n > arr.length || (!forInsert && n === arr.length))
    throw new OpError(`bad index ${seg}`);
  return n;
}

function walk(root: unknown, segs: string[]): { parent: Container; key: string } {
  let cur: unknown = root;
  for (const seg of segs.slice(0, -1)) {
    if (Array.isArray(cur)) cur = cur[resolveIndex(cur, seg, false)];
    else if (cur && typeof cur === "object") cur = (cur as Record<string, unknown>)[seg];
    else throw new OpError(`cannot walk into ${seg}`);
    if (cur === undefined) throw new OpError(`missing ${seg}`);
  }
  if (!cur || typeof cur !== "object") throw new OpError("parent is not a container");
  return { parent: cur as Container, key: segs[segs.length - 1]! };
}

function get(parent: Container, key: string): unknown {
  return Array.isArray(parent) ? parent[resolveIndex(parent, key, false)] : parent[key];
}

/** Apply ops to a deep copy; returns the new doc and the ops with `prev` filled in (for inversion). */
export function applyOps(doc: EditDoc, ops: EditOp[]): { doc: EditDoc; applied: EditOp[] } {
  const next = structuredClone(doc) as unknown;
  const applied: EditOp[] = [];
  for (const op of ops) {
    const segs = splitPath(op.path);
    const { parent, key } = walk(next, segs);
    if (op.op === "set") {
      const prev = get(parent, key);
      if (Array.isArray(parent)) parent[resolveIndex(parent, key, false)] = structuredClone(op.value);
      else parent[key] = structuredClone(op.value);
      applied.push({ op: "set", path: op.path, value: op.value, prev: structuredClone(prev) });
    } else if (op.op === "insert") {
      if (!Array.isArray(parent)) throw new OpError("insert needs an array parent");
      const i = resolveIndex(parent, key, true);
      parent.splice(i, 0, structuredClone(op.value));
      // record the concrete index so inversion removes the right item
      applied.push({ op: "insert", path: [...segs.slice(0, -1), String(i)].map(enc).join("/").replace(/^/, "/"), value: op.value });
    } else {
      const prev = get(parent, key);
      if (Array.isArray(parent)) {
        const i = resolveIndex(parent, key, false);
        parent.splice(i, 1);
        applied.push({ op: "remove", path: [...segs.slice(0, -1), String(i)].map(enc).join("/").replace(/^/, "/"), prev: structuredClone(prev) });
      } else {
        delete parent[key];
        applied.push({ op: "remove", path: op.path, prev: structuredClone(prev) });
      }
    }
  }
  return { doc: next as EditDoc, applied };
}

function enc(seg: string) {
  return seg.replace(/~/g, "~0").replace(/\//g, "~1");
}

/** Inverse of applied ops (which carry `prev`), in reverse order. */
export function invertOps(applied: EditOp[]): EditOp[] {
  return [...applied].reverse().map((op): EditOp => {
    if (op.op === "set") return { op: "set", path: op.path, value: op.prev, prev: op.value };
    if (op.op === "insert") return { op: "remove", path: op.path, prev: op.value };
    return { op: "insert", path: op.path, value: op.prev };
  });
}

/** Is `path` equal to or inside a pinned path? */
export function isPinned(pins: readonly string[], path: string): boolean {
  return pins.some((p) => path === p || path.startsWith(p + "/"));
}

/**
 * Apply a change. User changes pin the paths they touch; autopilot changes skip pinned paths
 * (the user's decision always wins). Returns null if nothing was left to apply.
 */
export function applyChange(
  doc: EditDoc,
  change: Change,
): { doc: EditDoc; applied: EditOp[]; skipped: EditOp[] } | null {
  const isUser = change.actor === "user";
  const skipped = isUser ? [] : change.ops.filter((o) => isPinned(doc.pins, o.path));
  const ops = isUser ? change.ops : change.ops.filter((o) => !isPinned(doc.pins, o.path));
  if (ops.length === 0) return null;
  const { doc: next, applied } = applyOps(doc, ops);
  if (isUser) {
    const newPins = applied.map((o) => o.path).filter((p) => !isPinned(next.pins, p));
    next.pins = [...next.pins, ...newPins];
  }
  next.version = doc.version + 1;
  return { doc: next, applied, skipped };
}
