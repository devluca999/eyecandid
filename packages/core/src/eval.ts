import { z } from "zod";
import type { JobOutput } from "./jobs";
import { EditDoc } from "./editModel";
import { toTimeline } from "./timeline";

/**
 * Golden-set evaluation of the automatic cut: score what autocut keeps against what a human editor kept.
 * Pure and deterministic. "Is the edit getting better?" becomes a number, but only once real editor
 * references exist: cases with `source: "example"` demonstrate the format and say nothing about quality.
 * All times are source-clip milliseconds.
 */

export type Range = { startMs: number; endMs: number };

export const WordTiming = z.object({ text: z.string(), startMs: z.number().nonnegative(), endMs: z.number().nonnegative(), conf: z.number().min(0).max(1).default(1) });
export type WordTiming = z.infer<typeof WordTiming>;

const RangeSchema = z.object({ startMs: z.number().nonnegative(), endMs: z.number().nonnegative() }).refine((r) => r.endMs >= r.startMs, "endMs must be >= startMs");

export const GoldenCase = z.object({
  id: z.string().min(1),
  /** ASR word timings of the raw clip (the autocut input) */
  words: z.array(WordTiming).min(1),
  /** source-time ranges a human editor kept */
  reference: z.object({ keep: z.array(RangeSchema) }),
  /** length of the raw clip; defaults to the end of the last word */
  durationMs: z.number().positive().optional(),
  notes: z.string().optional(),
  /** "editor" = a real human reference cut; "example" = hand-written format example, never evidence of quality */
  source: z.enum(["editor", "example"]).optional(),
});
export type GoldenCase = z.infer<typeof GoldenCase>;

/** Sort, drop empty ranges and merge overlapping or touching ones. */
export function mergeRanges(ranges: readonly Range[]): Range[] {
  const sorted = ranges.filter((r) => r.endMs > r.startMs).map((r) => ({ startMs: r.startMs, endMs: r.endMs })).sort((a, b) => a.startMs - b.startMs);
  const out: Range[] = [];
  for (const r of sorted) {
    const last = out[out.length - 1];
    if (last && r.startMs <= last.endMs) last.endMs = Math.max(last.endMs, r.endMs);
    else out.push(r);
  }
  return out;
}

function clip(ranges: readonly Range[], lo: number, hi: number): Range[] {
  return mergeRanges(ranges.map((r) => ({ startMs: Math.max(r.startMs, lo), endMs: Math.min(r.endMs, hi) })));
}

/** Complement of ranges inside [lo, hi]. */
function complement(ranges: readonly Range[], lo: number, hi: number): Range[] {
  const out: Range[] = [];
  let cursor = lo;
  for (const r of clip(ranges, lo, hi)) {
    if (r.startMs > cursor) out.push({ startMs: cursor, endMs: r.startMs });
    cursor = r.endMs;
  }
  if (cursor < hi) out.push({ startMs: cursor, endMs: hi });
  return out;
}

const total = (ranges: readonly Range[]) => ranges.reduce((s, r) => s + (r.endMs - r.startMs), 0);

/** Overlap length of two merged range lists. */
function overlap(a: readonly Range[], b: readonly Range[]): number {
  let i = 0;
  let j = 0;
  let sum = 0;
  while (i < a.length && j < b.length) {
    const lo = Math.max(a[i]!.startMs, b[j]!.startMs);
    const hi = Math.min(a[i]!.endMs, b[j]!.endMs);
    if (hi > lo) sum += hi - lo;
    if (a[i]!.endMs < b[j]!.endMs) i++;
    else j++;
  }
  return sum;
}

/**
 * The source-time ranges the automatic cut keeps: the spoken span (first word start to last word end)
 * minus every strike, merged and sorted. Beads only segment the clip, they remove nothing.
 */
export function keptRanges(words: readonly Pick<WordTiming, "startMs" | "endMs">[], output: Pick<JobOutput<"autocut">, "strikes">): Range[] {
  if (!words.length) return [];
  const lo = Math.min(...words.map((w) => w.startMs));
  const hi = Math.max(...words.map((w) => w.endMs));
  return complement(output.strikes, lo, hi);
}

export type CutScore = {
  /** share of the time we removed that the editor also removed (1 when we removed nothing) */
  precision: number;
  /** share of the time the editor removed that we also removed (1 when the editor removed nothing) */
  recall: number;
  f1: number;
  /** intersection over union of the KEPT time */
  iou: number;
  removedMsAuto: number;
  removedMsRef: number;
  /** |auto boundary - matched reference boundary| in ms over matched pairs; null when nothing matched */
  boundaryErrorMs: { p50: number | null; p90: number | null };
  /** auto cut boundaries with no reference boundary within BOUNDARY_MATCH_MS */
  extraCuts: number;
  /** reference cut boundaries with no auto boundary within BOUNDARY_MATCH_MS */
  missedCuts: number;
  /** auto boundaries strictly inside a word's [startMs, endMs] (0 when no words were given) */
  midWordCuts: number;
};

export const BOUNDARY_MATCH_MS = 500;

/** Cut boundaries: both edges of every removed range, except the clip's own start and end. */
function boundaries(removed: readonly Range[], durationMs: number): number[] {
  return removed.flatMap((r) => [r.startMs, r.endMs]).filter((t) => t > 0 && t < durationMs);
}

/** Nearest-rank percentile of an ascending list. */
function percentile(sorted: number[], p: number): number | null {
  if (!sorted.length) return null;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1))]!;
}

/**
 * Score an automatic cut against a reference cut, both given as KEPT ranges, over the window [0, durationMs].
 * Precision, recall and F1 are over removed time; IoU is over kept time. Boundaries are matched one to one,
 * closest pairs first, within BOUNDARY_MATCH_MS. Pass `words` to count mid-word cuts.
 */
export function scoreCut(auto: readonly Range[], ref: readonly Range[], durationMs: number, words: readonly Pick<WordTiming, "startMs" | "endMs">[] = []): CutScore {
  const keptA = clip(auto, 0, durationMs);
  const keptR = clip(ref, 0, durationMs);
  const remA = complement(keptA, 0, durationMs);
  const remR = complement(keptR, 0, durationMs);
  const removedMsAuto = total(remA);
  const removedMsRef = total(remR);
  const inter = overlap(remA, remR);
  const precision = removedMsAuto === 0 ? 1 : inter / removedMsAuto;
  const recall = removedMsRef === 0 ? 1 : inter / removedMsRef;
  const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
  const kInter = overlap(keptA, keptR);
  const kUnion = total(keptA) + total(keptR) - kInter;
  const iou = kUnion === 0 ? 1 : kInter / kUnion;

  const bA = boundaries(remA, durationMs);
  const bR = boundaries(remR, durationMs);
  const pairs: { a: number; r: number; d: number }[] = [];
  bA.forEach((a, ia) =>
    bR.forEach((r, ir) => {
      const d = Math.abs(a - r);
      if (d <= BOUNDARY_MATCH_MS) pairs.push({ a: ia, r: ir, d });
    }),
  );
  pairs.sort((x, y) => x.d - y.d || x.a - y.a || x.r - y.r);
  const usedA = new Set<number>();
  const usedR = new Set<number>();
  const errors: number[] = [];
  for (const p of pairs) {
    if (usedA.has(p.a) || usedR.has(p.r)) continue;
    usedA.add(p.a);
    usedR.add(p.r);
    errors.push(p.d);
  }
  errors.sort((x, y) => x - y);
  const midWordCuts = bA.filter((t) => words.some((w) => t > w.startMs && t < w.endMs)).length;
  return {
    precision,
    recall,
    f1,
    iou,
    removedMsAuto,
    removedMsRef,
    boundaryErrorMs: { p50: percentile(errors, 0.5), p90: percentile(errors, 0.9) },
    extraCuts: bA.length - usedA.size,
    missedCuts: bR.length - usedR.size,
    midWordCuts,
  };
}

export type EvalSummary = {
  cases: number;
  /** means over cases */
  precision: number;
  recall: number;
  f1: number;
  iou: number;
  /** mean of the per-case percentiles, over cases that had at least one matched boundary */
  boundaryErrorMs: { p50: number | null; p90: number | null };
  /** totals over cases */
  extraCuts: number;
  missedCuts: number;
  midWordCuts: number;
  /**
   * Reserved for the blind pairwise test against a human editor (north star: >= 50%). It needs ~200 clips and
   * raters, which do not exist yet, so this is NEVER computed here and stays undefined.
   */
  winRate: number | undefined;
};

const mean = (xs: number[]) => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : 0);
const meanOrNull = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? mean(v) : null;
};

export function summarise(scores: readonly CutScore[]): EvalSummary {
  return {
    cases: scores.length,
    precision: mean(scores.map((s) => s.precision)),
    recall: mean(scores.map((s) => s.recall)),
    f1: mean(scores.map((s) => s.f1)),
    iou: mean(scores.map((s) => s.iou)),
    boundaryErrorMs: { p50: meanOrNull(scores.map((s) => s.boundaryErrorMs.p50)), p90: meanOrNull(scores.map((s) => s.boundaryErrorMs.p90)) },
    extraCuts: scores.reduce((s, x) => s + x.extraCuts, 0),
    missedCuts: scores.reduce((s, x) => s + x.missedCuts, 0),
    midWordCuts: scores.reduce((s, x) => s + x.midWordCuts, 0),
    winRate: undefined,
  };
}

/**
 * Derive a GoldenCase from an exported edit doc: `keep` is the source ranges of toTimeline(doc).segments
 * (optionally one clip), `words` are the doc's words in time order (struck or not: the raw ASR words).
 * The caller vouches that the doc is a human-made edit; the case is marked source "editor".
 */
export function goldenFromEditDoc(docJson: unknown, opts: { id: string; clipId?: string; notes?: string }): GoldenCase {
  const doc = EditDoc.parse(docJson);
  const clipId = opts.clipId ?? doc.clips[0]?.id;
  const segments = toTimeline(doc).segments.filter((s) => !clipId || s.clipId === clipId);
  const words = doc.beads
    .filter((b) => !clipId || b.clipId === clipId)
    .flatMap((b) => b.words)
    .map((w) => ({ text: w.text, startMs: w.startMs, endMs: w.endMs, conf: w.conf }))
    .sort((a, b) => a.startMs - b.startMs);
  const clipDuration = doc.clips.find((c) => c.id === clipId)?.durationMs;
  return GoldenCase.parse({
    id: opts.id,
    words,
    reference: { keep: mergeRanges(segments.map((s) => ({ startMs: s.fromMs, endMs: s.toMs }))) },
    ...(clipDuration ? { durationMs: clipDuration } : {}),
    ...(opts.notes ? { notes: opts.notes } : {}),
    source: "editor",
  });
}
