import type { EditDoc } from "./editModel";

/** ms of breathing room kept either side of a struck word */
export const WORD_HANDLE_MS = 40;

export type Segment = { clipId: string; mediaId: string; fromMs: number; toMs: number };
export type CaptionWord = { id?: string; text: string; startMs: number; endMs: number };
export type CaptionChunk = { startMs: number; endMs: number; text: string; words: CaptionWord[] };

/**
 * Edit model → playable timeline. Struck beads and struck words are skipped (never deleted from the doc).
 * Output times are on the *output* timeline. Pure and deterministic: the same doc renders the same cut.
 */
export function toTimeline(doc: EditDoc): { segments: Segment[]; captions: CaptionChunk[]; durationMs: number } {
  const clips = new Map(doc.clips.map((c) => [c.id, c]));
  const overrides = new Map(doc.captions.overrides.map((o) => [o.wordId, o.text]));
  const segments: Segment[] = [];
  const words: CaptionWord[] = [];
  let outMs = 0;

  for (const bead of doc.beads) {
    if (bead.struck) continue;
    const clip = clips.get(bead.clipId);
    if (!clip) continue;
    // keep ranges = bead span minus struck words and struck silences
    const struck = [
      // a struck word keeps a short handle on a side only where a kept word sits right next to it,
      // so that neighbour's consonants aren't clipped (no handle at a bead edge or next to another strike)
      ...bead.words.flatMap((w, i) => {
        if (!w.struck) return [];
        const room = w.endMs - w.startMs > 3 * WORD_HANDLE_MS;
        const prev = bead.words[i - 1];
        const next = bead.words[i + 1];
        const hl = room && prev && !prev.struck && w.startMs - prev.endMs < WORD_HANDLE_MS ? WORD_HANDLE_MS : 0;
        const hr = room && next && !next.struck && next.startMs - w.endMs < WORD_HANDLE_MS ? WORD_HANDLE_MS : 0;
        // the gap between two struck words goes with them: a struck take never plays back as slivers of air
        const from = prev?.struck ? Math.min(prev.endMs, w.startMs) : w.startMs + hl;
        return [[Math.max(from, bead.inMs), Math.min(w.endMs - hr, bead.outMs)] as const];
      }),
      ...bead.cuts.filter((c) => c.struck).map((c) => [Math.max(c.startMs, bead.inMs), Math.min(c.endMs, bead.outMs)] as const),
    ];
    let cursor = bead.inMs;
    const ranges: [number, number][] = [];
    for (const [s, e] of struck.sort((a, b) => a[0] - b[0])) {
      if (s > cursor) ranges.push([cursor, s]);
      cursor = Math.max(cursor, e);
    }
    if (cursor < bead.outMs) ranges.push([cursor, bead.outMs]);

    for (const [from, to] of ranges) {
      if (to - from < 40) continue; // sub-frame slivers
      for (const w of bead.words) {
        if (w.struck || w.startMs < from || w.endMs > to) continue;
        words.push({ id: w.id, text: overrides.get(w.id) ?? w.text, startMs: outMs + (w.startMs - from), endMs: outMs + (w.endMs - from) });
      }
      segments.push({ clipId: clip.id, mediaId: clip.mediaId, fromMs: from, toMs: to });
      outMs += to - from;
    }
  }
  return { segments, captions: doc.captions.enabled ? chunk(words) : [], durationMs: outMs };
}

/** 3–5 word caption chunks, broken at punctuation and pauses (ported from legacy-engine/remotion-kit). */
export function chunk(words: CaptionWord[]): CaptionChunk[] {
  const out: CaptionChunk[] = [];
  let cur: typeof words = [];
  const flush = (end: number) => {
    if (cur.length) out.push({ startMs: cur[0]!.startMs, endMs: end, text: cur.map((w) => w.text).join(" "), words: cur });
    cur = [];
  };
  words.forEach((w, i) => {
    cur.push(w);
    const next = words[i + 1];
    const pause = next ? next.startMs - w.endMs > 300 : true;
    if (cur.length >= 5 || /[.,?!:]$/.test(w.text) || pause) flush(next ? Math.min(next.startMs, w.endMs + 500) : w.endMs + 400);
  });
  return out;
}

/** Output time → source position, for players that preview the edit without rendering it. */
export function sourceAt(segments: Segment[], outMs: number): { index: number; clipId: string; mediaId: string; srcMs: number } | null {
  let acc = 0;
  for (const [index, s] of segments.entries()) {
    const len = s.toMs - s.fromMs;
    if (outMs < acc + len) return { index, clipId: s.clipId, mediaId: s.mediaId, srcMs: s.fromMs + (outMs - acc) };
    acc += len;
  }
  return null;
}

/** Source position → output time (inverse of sourceAt), or null if that moment is cut. */
export function outputAt(segments: Segment[], clipId: string, srcMs: number): number | null {
  let acc = 0;
  for (const s of segments) {
    if (s.clipId === clipId && srcMs >= s.fromMs && srcMs < s.toMs) return acc + (srcMs - s.fromMs);
    acc += s.toMs - s.fromMs;
  }
  return null;
}
