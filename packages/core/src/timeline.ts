import { CAPTION_MAX_CHARS, fitsTwoLines } from "./captions";
import type { EditDoc } from "./editModel";

/** ms of breathing room kept either side of a struck word */
export const WORD_HANDLE_MS = 40;

/** one kept range of a clip; `beadId` names the bead it came from (b-roll anchors to it) */
export type Segment = { clipId: string; mediaId: string; fromMs: number; toMs: number; beadId?: string };
export type CaptionWord = { id?: string; text: string; startMs: number; endMs: number };
export type CaptionChunk = { startMs: number; endMs: number; text: string; words: CaptionWord[] };

/** how far the sound and the picture of a cut are split (J or L cut) */
export const JL_LEAD_MS = 80;
/** the click-free window at every sound join: the outgoing piece fades out over its last half, the incoming fades in over its first */
export const AUDIO_FADE_MS = 30;

/** a piece of the picture or the sound track: source range [fromMs, toMs) of a clip, starting at output time `atMs` */
export type Placed = Segment & { atMs: number };
/** a piece of sound, with its fades (ms) at each end; fades sit inside the kept range, so no cut audio is ever heard */
export type SoundPiece = Placed & { fadeInMs: number; fadeOutMs: number };
/**
 * A cut where picture and sound change at different moments. J: the sound of the next phrase starts `leadMs` before
 * its picture (used where the next piece starts a sentence). L: the picture changes `leadMs` before the sound.
 */
export type Join = { atMs: number; kind: "J" | "L"; leadMs: number };
export type Timeline = {
  /** kept ranges, back to back on the output timeline; the sound plays exactly these (captions follow them) */
  segments: Segment[];
  /** the picture: the same ranges, with each cut moved by its J/L lead; tiles [0, durationMs) */
  picture: Placed[];
  /** the sound: the same ranges as `segments`, with fades at every cut */
  sound: SoundPiece[];
  joins: Join[];
  captions: CaptionChunk[];
  durationMs: number;
};

/**
 * Edit model → playable timeline. Struck beads and struck words are skipped (never deleted from the doc).
 * Output times are on the *output* timeline. Pure and deterministic: the same doc renders the same cut.
 */
export function toTimeline(doc: EditDoc): Timeline {
  const clips = new Map(doc.clips.map((c) => [c.id, c]));
  const overrides = new Map(doc.captions.overrides.map((o) => [o.wordId, o.text]));
  const segments: Segment[] = [];
  const words: CaptionWord[] = [];
  const cutsAt: number[] = []; // output times where the edit jumps: a caption never spans one
  const lastWord: (string | undefined)[] = []; // last kept word of each segment (a sentence end leads a J cut)
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
      let lastKept: string | undefined;
      for (const w of bead.words) {
        if (w.struck || w.startMs < from || w.endMs > to) continue;
        words.push({ id: w.id, text: overrides.get(w.id) ?? w.text, startMs: outMs + (w.startMs - from), endMs: outMs + (w.endMs - from) });
        lastKept = w.text;
      }
      lastWord.push(lastKept);
      const last = segments.at(-1);
      if (last && (last.clipId !== clip.id || last.toMs !== from)) cutsAt.push(outMs);
      segments.push({ clipId: clip.id, mediaId: clip.mediaId, fromMs: from, toMs: to, beadId: bead.id });
      outMs += to - from;
    }
  }
  const { picture, sound, joins } = splitSound(segments, lastWord, (id) => clips.get(id)?.durationMs ?? 0);
  return { segments, picture, sound, joins, captions: doc.captions.enabled ? chunk(words, { cutsAt }) : [], durationMs: outMs };
}

const SENTENCE_END = /[.?!]["'”)\]]*$/;

/**
 * J and L cuts. The sound plays the kept ranges exactly; only the picture's cut moves. Where the next piece starts a
 * sentence (a new bead, or the previous kept word ends one) the sound leads: the old picture holds for `JL_LEAD_MS`
 * while the new phrase is already heard (J). Otherwise the picture leads into the next piece and the sound follows (L).
 * The lead is clamped so the picture never shows frames past the clip, never repeats frames the edit shows anyway (it
 * stays inside the removed gap on a forward jump), and never takes more than a third of either piece. Total duration
 * and every word's timing are unchanged. Contiguous pieces (no jump) are not a cut and get neither a lead nor fades.
 */
function splitSound(segments: Segment[], lastWord: (string | undefined)[], clipMs: (clipId: string) => number) {
  const picture: Placed[] = [];
  const sound: SoundPiece[] = [];
  const joins: Join[] = [];
  const shift: number[] = segments.map(() => 0); // where the picture cut before piece i moves (+ later, - earlier)
  const fade = (len: number) => Math.min(AUDIO_FADE_MS / 2, Math.floor(len / 4));
  let at = 0;
  segments.forEach((s, i) => {
    const prev = segments[i - 1];
    const len = s.toMs - s.fromMs;
    const cut = !!prev && (prev.clipId !== s.clipId || prev.toMs !== s.fromMs);
    sound.push({ ...s, atMs: at, fadeInMs: !prev || cut ? fade(len) : 0, fadeOutMs: 0 });
    if (prev && cut) {
      sound[i - 1]!.fadeOutMs = fade(prev.toMs - prev.fromMs);
      const gap = prev.clipId === s.clipId && s.fromMs >= prev.toMs ? s.fromMs - prev.toMs : Infinity;
      const room = Math.min(JL_LEAD_MS, Math.floor((prev.toMs - prev.fromMs) / 3), Math.floor(len / 3), gap);
      const sentence = prev.beadId !== s.beadId || SENTENCE_END.test(lastWord[i - 1] ?? "");
      // J: the old picture runs on past prev.toMs; L: the new picture starts before s.fromMs
      const lead = Math.floor(sentence ? Math.min(room, clipMs(prev.clipId) - prev.toMs) : Math.min(room, s.fromMs));
      if (lead >= 10) {
        shift[i] = sentence ? lead : -lead;
        joins.push({ atMs: at, kind: sentence ? "J" : "L", leadMs: lead });
      }
    }
    at += len;
  });
  if (sound.length) sound[sound.length - 1]!.fadeOutMs = fade(sound.at(-1)!.toMs - sound.at(-1)!.fromMs);
  at = 0;
  segments.forEach((s, i) => {
    const a = shift[i]!;
    const b = shift[i + 1] ?? 0;
    picture.push({ ...s, fromMs: s.fromMs + a, toMs: s.toMs + b, atMs: at + a });
    at += s.toMs - s.fromMs;
  });
  return { picture, sound, joins };
}

/** First frame, frame count and source offset (frames) of a placed piece, from cumulative output ms so neighbours never drift apart. */
export function framesOf(p: { atMs: number; fromMs: number; toMs: number }, fps: number): { from: number; frames: number; trimBefore: number } {
  const from = Math.round((p.atMs / 1000) * fps);
  const to = Math.round(((p.atMs + p.toMs - p.fromMs) / 1000) * fps);
  return { from, frames: to - from, trimBefore: Math.round((p.fromMs / 1000) * fps) };
}

/** a pause this long is a natural caption break */
export const CAPTION_PAUSE_MS = 300;

/**
 * Caption chunks that fit two lines of `maxChars` (see captionLines), broken at punctuation and pauses of 300ms+,
 * never across a cut (`cutsAt`: output times where the edit jumps), and never leaving a short word (3 letters or
 * fewer) alone when it fits with a neighbour.
 */
export function chunk(words: CaptionWord[], opts: { maxChars?: number; cutsAt?: number[] } = {}): CaptionChunk[] {
  const maxChars = opts.maxChars ?? CAPTION_MAX_CHARS;
  const cutsAt = opts.cutsAt ?? [];
  const text = (ws: CaptionWord[]) => ws.map((w) => w.text).join(" ");
  // strength of the boundary after word i: 3 cut or end (never joined), 2 sentence, 1 comma or pause, 0 none
  const strength = (i: number) => {
    const w = words[i]!;
    const next = words[i + 1];
    if (!next || cutsAt.some((c) => c >= w.endMs && c <= next.startMs)) return 3;
    if (/[.?!]$/.test(w.text)) return 2;
    if (/[,:;]$/.test(w.text) || next.startMs - w.endMs >= CAPTION_PAUSE_MS) return 1;
    return 0;
  };

  // greedy: fill up to two lines, break at every natural boundary
  const groups: { ws: CaptionWord[]; after: number }[] = [];
  let cur: CaptionWord[] = [];
  words.forEach((w, i) => {
    if (cur.length && !fitsTwoLines(text([...cur, w]), maxChars)) {
      groups.push({ ws: cur, after: 0 });
      cur = [];
    }
    cur.push(w);
    const s = strength(i);
    if (s > 0) {
      groups.push({ ws: cur, after: s });
      cur = [];
    }
  });

  // a lone short word joins the neighbour across the weaker boundary, if it fits and no cut is in the way
  const short = (g: { ws: CaptionWord[] }) => g.ws.length === 1 && g.ws[0]!.text.replace(/[^\p{L}\p{N}]/gu, "").length <= 3;
  for (let i = 0; i < groups.length; i++) {
    const g = groups[i]!;
    if (!short(g)) continue;
    const prev = groups[i - 1];
    const next = groups[i + 1];
    const toPrev = prev && prev.after < 3 && fitsTwoLines(text([...prev.ws, ...g.ws]), maxChars) ? prev.after : Infinity;
    const toNext = next && g.after < 3 && fitsTwoLines(text([...g.ws, ...next.ws]), maxChars) ? g.after : Infinity;
    if (toPrev === Infinity && toNext === Infinity) continue;
    if (toNext <= toPrev) {
      next!.ws = [...g.ws, ...next!.ws];
    } else {
      prev!.ws = [...prev!.ws, ...g.ws];
      prev!.after = g.after;
    }
    groups.splice(i, 1);
    i--;
  }

  return groups.map(({ ws }) => {
    const last = ws.at(-1)!;
    const next = words[words.indexOf(last) + 1];
    return { startMs: ws[0]!.startMs, endMs: next ? Math.min(next.startMs, last.endMs + 500) : last.endMs + 400, text: text(ws), words: ws };
  });
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
