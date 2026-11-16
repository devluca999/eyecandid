import type { EditDoc } from "@eyelore/core";

export type Segment = { clipId: string; mediaId: string; fromMs: number; toMs: number };
export type CaptionChunk = { startMs: number; endMs: number; text: string };

/**
 * Edit model → playable timeline. Struck beads and struck words are skipped (never deleted from the doc).
 * Output times are on the *output* timeline. Pure and deterministic: the same doc renders the same cut.
 */
export function toTimeline(doc: EditDoc): { segments: Segment[]; captions: CaptionChunk[]; durationMs: number } {
  const clips = new Map(doc.clips.map((c) => [c.id, c]));
  const overrides = new Map(doc.captions.overrides.map((o) => [o.wordId, o.text]));
  const segments: Segment[] = [];
  const words: { text: string; startMs: number; endMs: number }[] = [];
  let outMs = 0;

  for (const bead of doc.beads) {
    if (bead.struck) continue;
    const clip = clips.get(bead.clipId);
    if (!clip) continue;
    // keep ranges = bead span minus struck words and struck silences
    const struck = [
      ...bead.words.filter((w) => w.struck).map((w) => [Math.max(w.startMs, bead.inMs), Math.min(w.endMs, bead.outMs)] as const),
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
        words.push({ text: overrides.get(w.id) ?? w.text, startMs: outMs + (w.startMs - from), endMs: outMs + (w.endMs - from) });
      }
      segments.push({ clipId: clip.id, mediaId: clip.mediaId, fromMs: from, toMs: to });
      outMs += to - from;
    }
  }
  return { segments, captions: doc.captions.enabled ? chunk(words) : [], durationMs: outMs };
}

/** 3–5 word caption chunks, broken at punctuation and pauses (ported from legacy-engine/remotion-kit). */
export function chunk(words: { text: string; startMs: number; endMs: number }[]): CaptionChunk[] {
  const out: CaptionChunk[] = [];
  let cur: typeof words = [];
  const flush = (end: number) => {
    if (cur.length) out.push({ startMs: cur[0]!.startMs, endMs: end, text: cur.map((w) => w.text).join(" ") });
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
