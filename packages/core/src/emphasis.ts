import type { Bead, EditDoc, Word } from "./editModel";
import { outputAt, toTimeline } from "./timeline";

/**
 * Prosodic emphasis from loudness: the words someone leaned on. Each word carries `rms`, its RMS level relative to
 * the take's median word (1 = an ordinary word), measured by whoever heard the audio (the device engine, or the
 * worker's transcribe). The energy dial punches in on the strongest of them. Without `rms` nothing here fires.
 */

/** a word at least this much louder than the take's median word is a candidate */
export const EMPHASIS_MIN_RMS = 1.5;
/** ...and this much louder than the words around it (so a loud passage doesn't light up word by word) */
export const EMPHASIS_LOCAL = 1.2;
/** the closest two emphasis punch-ins may sit on the output timeline (at full energy) */
export const EMPHASIS_GAP_MS = 4000;
/** how long a punch-in holds after the word ends (or to the end of its bead) */
export const EMPHASIS_HOLD_MS = 1200;
/** the punch starts this much before the word so the push lands on its first sound */
export const EMPHASIS_PRE_MS = 100;

const FILLERS = new Set(["um", "uhm", "umm", "uh", "erm", "er", "ah", "hmm", "like", "so", "basically"]);
/** function words: loud on them is usually the mic or a breath, not meaning (seen on a real take: "your" at 1.84) */
const FUNCTION = new Set(
  ("the and but for nor yet you your yours you're our ours their theirs they them they're his her hers its it's this that these those " +
    "with from into onto over under about then than was were are been being have has had does did will would can could should " +
    "just very really what when where which who whom whose how why there here i'm i've we're we've").split(" "),
);
const bare = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}']/gu, "");

/**
 * Per-word RMS relative to the median word, from mono PCM. Pure; twin of `word_rms` in the worker's transcribe
 * handler. Words outside the audio, or a take with no level at all, get 0.
 */
export function wordRms(samples: Float32Array, sampleRate: number, words: { startMs: number; endMs: number }[]): number[] {
  const raw = words.map((w) => {
    const a = Math.max(0, Math.floor((w.startMs / 1000) * sampleRate));
    const b = Math.min(samples.length, Math.ceil((w.endMs / 1000) * sampleRate));
    if (b <= a) return 0;
    let s = 0;
    for (let i = a; i < b; i++) s += samples[i]! * samples[i]!;
    return Math.sqrt(s / (b - a));
  });
  const sorted = raw.filter((v) => v > 0).sort((x, y) => x - y);
  if (!sorted.length) return raw.map(() => 0);
  const mid = sorted.length >> 1;
  const median = sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
  return raw.map((v) => Math.round((v / median) * 100) / 100);
}

/** Minimum spacing between emphasis punch-ins for an energy value: none at 0.5 and below, 8 s → 4 s above. */
export function emphasisGapMs(energy: number): number | null {
  const e = Math.max(0, Math.min(1, energy));
  if (e <= 0.5) return null;
  return Math.round(2 * EMPHASIS_GAP_MS - ((e - 0.5) / 0.5) * EMPHASIS_GAP_MS);
}

export type Emphasis = { bead: Bead; word: Word; outMs: number; rms: number };

/**
 * The words to punch in on at this energy, in time order: loud against the take and against their neighbours, a real
 * word (not a filler or a function word like "your", three letters or more), kept in the cut, and spaced at least `emphasisGapMs(energy)` apart on
 * the output timeline, the loudest first.
 */
export function emphasisWords(doc: EditDoc, energy: number): Emphasis[] {
  const gap = emphasisGapMs(energy);
  if (gap === null) return [];
  const { segments } = toTimeline(doc);
  const cands: Emphasis[] = [];
  for (const bead of doc.beads) {
    if (bead.struck) continue;
    const kept = bead.words.filter((w) => !w.struck);
    kept.forEach((w, i) => {
      const rms = w.rms;
      if (rms === undefined || rms < EMPHASIS_MIN_RMS) return;
      const t = bare(w.text);
      if (t.replace(/'/g, "").length < 3 || FILLERS.has(t) || FUNCTION.has(t)) return;
      const around = [...kept.slice(Math.max(0, i - 2), i), ...kept.slice(i + 1, i + 3)].map((x) => x.rms ?? 0);
      const ref = around.length ? around.reduce((a, b) => a + b, 0) / around.length : 0;
      if (ref > 0 && rms < EMPHASIS_LOCAL * ref) return;
      const outMs = outputAt(segments, bead.clipId, w.startMs);
      if (outMs === null) return;
      cands.push({ bead, word: w, outMs, rms });
    });
  }
  const picked: Emphasis[] = [];
  for (const c of cands.sort((a, b) => b.rms - a.rms || a.outMs - b.outMs)) {
    if (picked.every((p) => Math.abs(p.outMs - c.outMs) >= gap)) picked.push(c);
  }
  return picked.sort((a, b) => a.outMs - b.outMs);
}

/** The source span (ms) an emphasis punch-in covers: just before the word, held a beat after it, inside its bead. */
export function emphasisSpan(bead: Bead, word: Word): { fromMs: number; toMs: number } {
  return { fromMs: Math.max(bead.inMs, word.startMs - EMPHASIS_PRE_MS), toMs: Math.min(bead.outMs, word.endMs + EMPHASIS_HOLD_MS) };
}

/** The word as said, for a reason line: "never", not "never," */
export function quoteWord(text: string): string {
  return text.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "").toLowerCase();
}
