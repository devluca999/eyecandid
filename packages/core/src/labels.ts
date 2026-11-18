import type { EditDoc } from "./editModel";
import type { Change } from "./ops";

/**
 * Flywheel labels, pure part. A user edit is a verdict on what the autopilot decided:
 * - restore: the user un-struck a word, silence or bead, so the cut was wrong
 * - strike: the user struck something the autopilot kept, so we missed a cut
 * - pin: the user explicitly pinned a path (pins are the user's final say)
 * - caption_edit: the user overrode a caption word
 * Only changes with actor "user" produce labels. Autopilot changes produce none, so we never learn from ourselves.
 * Storage and wiring into mutations are the next step (see eval/README.md); nothing here touches Convex.
 * `atMs` and `spanMs` are source-clip milliseconds.
 */
export type Label = {
  kind: "restore" | "strike" | "pin" | "caption_edit";
  atMs: number;
  spanMs: number;
  /** for restore: what the autopilot had struck it as (filler, silence, repeat, user); for strike: "user" (or "silence" for a cut) */
  strikeKind?: "filler" | "silence" | "repeat" | "user";
  by: "user";
};

const decode = (s: string) => s.replace(/~1/g, "/").replace(/~0/g, "~");
const segsOf = (path: string) => (path.startsWith("/") ? path.slice(1).split("/").map(decode) : []);

function pick<T extends { id: string }>(arr: readonly T[], seg: string | undefined): T | undefined {
  if (seg === undefined) return undefined;
  if (seg.startsWith("@")) return arr.find((x) => x.id === seg.slice(1));
  return /^\d+$/.test(seg) ? arr[Number(seg)] : undefined;
}

type Target = { key: string; startMs: number; endMs: number; struck: boolean; strikeKind?: Label["strikeKind"] };

/** Resolve "/beads/@b/struck", ".../words/@w/struck" or ".../cuts/@c/struck" against the doc before the change. */
function strikeTarget(doc: EditDoc, path: string): Target | undefined {
  const s = segsOf(path);
  if (s[0] !== "beads") return undefined;
  const bead = pick(doc.beads, s[1]);
  if (!bead) return undefined;
  if (s.length === 3 && s[2] === "struck") return { key: `b:${bead.id}`, startMs: bead.inMs, endMs: bead.outMs, struck: bead.struck };
  if (s.length === 5 && s[4] === "struck" && s[2] === "words") {
    const w = pick(bead.words, s[3]);
    return w && { key: `w:${w.id}`, startMs: w.startMs, endMs: w.endMs, struck: w.struck, strikeKind: w.strikeKind };
  }
  if (s.length === 5 && s[4] === "struck" && s[2] === "cuts") {
    const c = pick(bead.cuts, s[3]);
    return c && { key: `c:${c.id}`, startMs: c.startMs, endMs: c.endMs, struck: c.struck, strikeKind: "silence" };
  }
  return undefined;
}

function findWord(doc: EditDoc, id: string) {
  for (const b of doc.beads) {
    const w = b.words.find((x) => x.id === id);
    if (w) return w;
  }
  return undefined;
}

/** Resolve a pin path ("/beads/@b", ".../words/@w", ".../cuts/@c", or deeper) to a source span, if it names one. */
function spanOfPath(doc: EditDoc, path: string): { startMs: number; endMs: number } | undefined {
  const s = segsOf(path);
  if (s[0] !== "beads") return undefined;
  const bead = pick(doc.beads, s[1]);
  if (!bead) return undefined;
  if (s[2] === "words") {
    const w = pick(bead.words, s[3]);
    if (w) return w;
  }
  if (s[2] === "cuts") {
    const c = pick(bead.cuts, s[3]);
    if (c) return c;
  }
  return { startMs: bead.inMs, endMs: bead.outMs };
}

export function labelsFromChange(before: EditDoc, change: Change): Label[] {
  if (change.actor !== "user") return [];
  const labels: Label[] = [];
  // struck state as it evolves across the ops of this one change
  const state = new Map<string, boolean>();
  const add = (kind: Label["kind"], startMs: number, endMs: number, strikeKind?: Label["strikeKind"]) =>
    labels.push({ kind, atMs: startMs, spanMs: Math.max(0, endMs - startMs), ...(strikeKind ? { strikeKind } : {}), by: "user" });

  for (const op of change.ops) {
    const segs = segsOf(op.path);

    if (op.op === "set" && segs[segs.length - 1] === "struck" && typeof op.value === "boolean") {
      const t = strikeTarget(before, op.path);
      if (!t) continue;
      const was = state.get(t.key) ?? t.struck;
      if (was === op.value) continue;
      state.set(t.key, op.value);
      if (op.value) add("strike", t.startMs, t.endMs, t.strikeKind === "silence" ? "silence" : "user");
      else add("restore", t.startMs, t.endMs, t.strikeKind);
      continue;
    }

    // a user-inserted struck silence is a strike the autopilot missed
    if (op.op === "insert" && segs[0] === "beads" && segs[2] === "cuts" && op.value && typeof op.value === "object") {
      const c = op.value as { startMs?: unknown; endMs?: unknown; struck?: unknown };
      if (typeof c.startMs === "number" && typeof c.endMs === "number" && c.struck !== false) add("strike", c.startMs, c.endMs, "silence");
      continue;
    }

    if (op.op === "insert" && segs[0] === "pins" && typeof op.value === "string") {
      const span = spanOfPath(before, op.value);
      if (span) add("pin", span.startMs, span.endMs);
      continue;
    }

    if (segs[0] === "captions" && segs[1] === "overrides") {
      let wordId: string | undefined;
      if (op.op === "insert" || (op.op === "set" && segs.length === 3)) {
        wordId = (op.value as { wordId?: unknown } | null | undefined)?.wordId as string | undefined;
      } else if (op.op === "set" && segs.length === 4 && segs[3] === "text") {
        const idx = /^\d+$/.test(segs[2]!) ? before.captions.overrides[Number(segs[2])] : undefined;
        wordId = idx?.wordId;
      }
      const w = typeof wordId === "string" ? findWord(before, wordId) : undefined;
      if (w) add("caption_edit", w.startMs, w.endMs);
    }
  }
  return labels;
}
