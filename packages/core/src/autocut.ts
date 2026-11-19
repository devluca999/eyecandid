import type { JobInput, JobOutput } from "./jobs";

/**
 * Autocut on word timings — the TypeScript twin of services/engine/eyelore_engine/handlers/autocut.py, kept
 * behaviour-identical (same tests, same fixture file) so the in-browser engine (free tier) and the server engine
 * cut the same way. Polishes how it was said, never what was said: strikes are restorable, never deletions, and
 * when a rule is unsure it leaves the words alone.
 *
 * 1. Mark words: fillers, single-word stutters, false starts ("so today we · so today we're…") and full retakes
 *    (a sentence said again right after) — the earlier attempt is struck, the last take is kept.
 * 2. Emit strikes around kept words: a run of struck words swallows the pause around it in ONE strike, from a breath
 *    after the last kept word to just before the next one; a pause between two kept words is trimmed the same way.
 *    No strike ever starts or ends inside a kept word.
 */
type Word = { text: string; startMs: number; endMs: number; conf?: number };
type Strike = JobOutput<"autocut">["strikes"][number];
type Span = { startMs: number; endMs: number };

const SENTENCE_END = /[.!?]$/;
// a word the speaker cut off mid-way: "w-", "we…", "we..."
const CUT_OFF = /(-|…|\.\.\.)$/;
// spelling variants ASR produces for the same hesitation: um/umm/ummm, uhm (Whisper base.en, owner QA 19 Nov), uh/uhh, er/erm, hm/hmm, ah
const FILLER_SOUND = /^(u+h*m+|u+h+|e+r+m*|h+m+|a+h+)$/;
// words people double on purpose ("bye bye", "very very", "no no"): never a stutter
const REDUPLICATED = new Set(["bye", "no", "yes", "yeah", "very", "really", "ha", "oh", "now", "go", "more", "please", "wait", "okay", "ok", "well", "too", "hey"]);
const SPLIT_PAUSE_MS = 650;
const SOFT_MAX_WORDS = 14;
const HARD_MAX_WORDS = 24;
const DEFAULT_FILLERS = ["um", "uh", "erm", "like", "you know", "so", "basically"];

/** breath kept after the last kept word: consonant decay and the breath out */
export const BREATH_TAIL_MS = 140;
/** breath kept before the next kept word */
export const BREATH_LEAD_MS = 80;
/** a pause this long between two attempts is evidence of a restart */
export const RESTART_GAP_MS = 200;
/** longest false start looked for, in words */
const FALSE_START_MAX_WORDS = 8;
/** a full retake: the later sentence starts with this many of the same words… */
const RETAKE_SAME_START = 3;
/** …both sentences have at least this many words (short emphatic repeats are left alone)… */
const RETAKE_MIN_WORDS = 4;
/** …and the later sentence contains the earlier one, word for word in order (see 1c) */
/** words quoted in a reason */
const QUOTE_WORDS = 6;

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}_' ]/gu, "").trim();

/** Breath to keep each side of a pause of `gapMs`: tail after, lead before, never more than 45% of the gap each. */
export function breath(gapMs: number): { tail: number; lead: number } {
  const cap = Math.floor((Math.max(0, gapMs) * 45) / 100);
  return { tail: Math.min(BREATH_TAIL_MS, cap), lead: Math.min(BREATH_LEAD_MS, cap) };
}

/**
 * The pause between a kept word ending at `prevEnd` and the next kept word starting at `nextStart`, with an optional
 * run of struck words in between. `pauseMs` is the silence a listener would hear once the run is gone; `startMs..endMs`
 * is what to remove (always covers the run, never reaches into a kept word). Either neighbour may be missing (clip edge).
 */
export function pauseAround(prevEnd: number | undefined, nextStart: number | undefined, run?: Span): { pauseMs: number; startMs: number; endMs: number } | null {
  if (!run) {
    if (prevEnd === undefined || nextStart === undefined) return null;
    const gap = nextStart - prevEnd;
    const { tail, lead } = breath(gap);
    return { pauseMs: gap, startMs: prevEnd + tail, endMs: nextStart - lead };
  }
  const before = prevEnd === undefined ? 0 : Math.max(0, run.startMs - prevEnd);
  const after = nextStart === undefined ? 0 : Math.max(0, nextStart - run.endMs);
  const pauseMs = before + after;
  const { tail, lead } = breath(pauseMs);
  return {
    pauseMs,
    startMs: prevEnd === undefined ? run.startMs : Math.min(run.startMs, prevEnd + tail),
    endMs: nextStart === undefined ? run.endMs : Math.max(run.endMs, nextStart - lead),
  };
}

/** "1.5s" with half-up rounding in integer maths, so both engines print the same thing */
const secs = (ms: number) => {
  const tenths = Math.floor((Math.max(0, ms) + 50) / 100);
  return `${Math.floor(tenths / 10)}.${tenths % 10}s`;
};

const quote = (ws: Word[]) => {
  const toks = ws.map((w) => norm(w.text)).filter(Boolean);
  return toks.slice(0, QUOTE_WORDS).join(" ") + (toks.length > QUOTE_WORDS ? "…" : "");
};

type Item = { i0: number; i1: number; kind: "filler" | "repeat"; reason: string };

/** Sentence index ranges, split exactly as beads are. */
function sentences(words: Word[]): [number, number][] {
  const out: [number, number][] = [];
  let start = 0;
  let count = 0;
  words.forEach((w, idx) => {
    const last = idx === words.length - 1;
    count++;
    const pauseAfter = last ? 0 : words[idx + 1]!.startMs - w.endMs;
    if (
      SENTENCE_END.test(w.text.trim()) ||
      last ||
      pauseAfter >= SPLIT_PAUSE_MS ||
      (count >= SOFT_MAX_WORDS && w.text.trimEnd().endsWith(",")) ||
      count >= HARD_MAX_WORDS
    ) {
      count = 0;
      out.push([start, idx]);
      start = idx + 1;
    }
  });
  return out;
}

export function autocut(input: Pick<JobInput<"autocut">, "words"> & Partial<JobInput<"autocut">>): JobOutput<"autocut"> {
  const words: Word[] = input.words;
  const n = words.length;
  const minSil = input.minSilenceMs ?? 450;
  const fillers = new Set((input.fillers ?? DEFAULT_FILLERS).map((f) => f.toLowerCase()));
  const multi = [...fillers].filter((f) => f.includes(" ")).map((f) => f.split(" "));
  const items: Item[] = [];
  const mark: (Item | undefined)[] = new Array<Item | undefined>(n).fill(undefined);
  const add = (it: Item) => {
    items.push(it);
    for (let k = it.i0; k <= it.i1; k++) mark[k] = it;
  };

  // 1a. fillers and single-word stutters
  let i = 0;
  while (i < n) {
    const w = words[i]!;
    let matched = false;
    for (const phrase of multi) {
      const seg = words.slice(i, i + phrase.length).map((x) => norm(x.text));
      if (seg.length === phrase.length && seg.every((s, k) => s === phrase[k])) {
        add({ i0: i, i1: i + phrase.length - 1, kind: "filler", reason: `trimmed filler · '${phrase.join(" ")}'` });
        i += phrase.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const t = norm(w.text);
    const prev = words[i - 1];
    if (FILLER_SOUND.test(t)) {
      add({ i0: i, i1: i, kind: "filler", reason: `trimmed filler · '${t}'` });
    } else if (fillers.has(t) && t !== "so" && t !== "like") {
      add({ i0: i, i1: i, kind: "filler", reason: `trimmed filler · '${t}'` });
    } else if (t === "so" || t === "like") {
      // only fillers when isolated by pauses
      const gapBefore = prev ? w.startMs - prev.endMs : 10_000;
      const next = words[i + 1];
      const gapAfter = next ? next.startMs - w.endMs : 10_000;
      if (gapBefore > 250 && gapAfter > 250) add({ i0: i, i1: i, kind: "filler", reason: `trimmed filler · '${t}'` });
    } else if (
      prev &&
      t &&
      t === norm(prev.text) &&
      !REDUPLICATED.has(t) &&
      // a stutter: same word back to back within one sentence ("it it"), not "…take it. It tracks"
      !SENTENCE_END.test(prev.text.trim()) &&
      !prev.text.trimEnd().endsWith(",") &&
      w.startMs - prev.endMs < 400
    ) {
      add({ i0: i, i1: i, kind: "repeat", reason: `trimmed repeat · '${t}'` });
    }
    i++;
  }

  // 1b. false starts: k >= 2 words said again straight after (struck fillers may sit between), with evidence of a
  // restart. Keep the last attempt.
  i = 0;
  while (i < n) {
    const k = falseStartAt(words, mark, i);
    if (k) {
      add({ i0: i, i1: i + k - 1, kind: "repeat", reason: `kept your last take · '${quote(words.slice(i, i + k))}'` });
      i += k; // the next attempt may itself be restarted: chains keep only the last
    } else i++;
  }

  // 1c. full retakes: a sentence said again as the next sentence. Strike the earlier one whole.
  const sents = sentences(words);
  for (let s = 0; s + 1 < sents.length; s++) {
    const [a0, a1] = sents[s]!;
    const [b0, b1] = sents[s + 1]!;
    const toks = (x0: number, x1: number) => {
      const out: string[] = [];
      for (let k = x0; k <= x1; k++) if (mark[k]?.kind !== "filler" && norm(words[k]!.text)) out.push(norm(words[k]!.text));
      return out;
    };
    const ta = toks(a0, a1);
    const tb = toks(b0, b1);
    if (ta.length < RETAKE_MIN_WORDS || tb.length < RETAKE_MIN_WORDS) continue;
    if (!ta.slice(0, RETAKE_SAME_START).every((x, k) => x === tb[k])) continue;
    // containment, not similarity: the kept take says everything the struck one said, in the same order (it may add
    // words). "…in the shower. …in the pool." are two things. Only a cut-off last word may be a prefix of its match.
    const cutOff = CUT_OFF.test(words[a1]!.text.trim());
    let q = 0;
    for (let k = 0; k < tb.length && q < ta.length; k++) {
      if (tb[k] === ta[q] || (cutOff && q === ta.length - 1 && tb[k]!.startsWith(ta[q]!))) q++;
    }
    if (q < ta.length) continue;
    // a mark reaching out of the sentence (a false start across a long pause) already decided this stretch
    if (items.some((it) => it.i0 <= a1 && it.i1 >= a0 && (it.i0 < a0 || it.i1 > a1))) continue;
    // the whole sentence becomes one strike; marks inside it are folded in
    for (let k = items.length - 1; k >= 0; k--) if (items[k]!.i0 >= a0 && items[k]!.i1 <= a1) items.splice(k, 1);
    add({ i0: a0, i1: a1, kind: "repeat", reason: `kept your last take · '${quote(words.slice(a0, a1 + 1))}'` });
  }

  // 2. strikes. Runs of struck words between kept neighbours take the pause around them with them.
  const strikes: Strike[] = [];
  items.sort((a, b) => a.i0 - b.i0);
  let r = 0;
  while (r < items.length) {
    let e = r;
    while (e + 1 < items.length && items[e + 1]!.i0 === items[e]!.i1 + 1) e++;
    const a = items[r]!.i0;
    const b = items[e]!.i1;
    const run = { startMs: words[a]!.startMs, endMs: words[b]!.endMs };
    const p = pauseAround(words[a - 1]?.endMs, words[b + 1]?.startMs, run)!;
    const merge = p.pauseMs >= minSil;
    for (let k = r; k <= e; k++) {
      const it = items[k]!;
      strikes.push({
        startMs: k === r && merge ? p.startMs : words[it.i0]!.startMs,
        // inside a run, each strike reaches the next one: the dead air between two struck takes goes with them
        endMs: k < e ? words[items[k + 1]!.i0]!.startMs : merge ? p.endMs : words[it.i1]!.endMs,
        kind: it.kind,
        reason: it.reason,
      });
    }
    r = e + 1;
  }
  for (let k = 0; k + 1 < n; k++) {
    if (mark[k] || mark[k + 1]) continue;
    const a = words[k]!;
    const b = words[k + 1]!;
    if (b.startMs - a.endMs < minSil) continue;
    const p = pauseAround(a.endMs, b.startMs)!;
    if (p.endMs > p.startMs) strikes.push({ startMs: p.startMs, endMs: p.endMs, kind: "silence", reason: `trimmed pause · ${secs(p.pauseMs)}` });
  }

  const beads: JobOutput<"autocut">["beads"] = sents.map(([s0, s1]) => ({ inMs: words[s0]!.startMs, outMs: words[s1]!.endMs }));
  // hook and call to action go to the first and last line that is still said, not to a take that was struck
  let said = sents.flatMap(([s0, s1], k) => (mark.slice(s0, s1 + 1).some((m) => !m) ? [k] : []));
  if (!said.length) said = beads.map((_, k) => k);
  if (said.length) {
    beads[said[0]!]!.moment = "hook";
    if (said.length > 1) beads[said.at(-1)!]!.moment = "cta";
  }
  strikes.sort((a, b) => a.startMs - b.startMs);
  return { strikes, beads };
}

/** Length of the false start beginning at word i (0 if none). */
function falseStartAt(words: Word[], mark: (Item | undefined)[], i: number): number {
  const n = words.length;
  for (let k = Math.min(FALSE_START_MAX_WORDS, Math.floor((n - i) / 2)); k >= 2; k--) {
    // the first attempt: unmarked words, no sentence end inside it (a finished sentence is not a false start)
    let ok = true;
    for (let m = 0; m < k && ok; m++) {
      const x = words[i + m]!;
      if (mark[i + m] || !norm(x.text)) ok = false;
      else if (m < k - 1 && SENTENCE_END.test(x.text.trim())) ok = false;
    }
    if (!ok) continue;
    const lastRaw = words[i + k - 1]!.text.trim();
    const cutOff = CUT_OFF.test(lastRaw);
    if (!cutOff && SENTENCE_END.test(lastRaw)) continue;
    // struck fillers may sit between the attempts
    let j = i + k;
    while (j < n && mark[j]?.kind === "filler") j++;
    if (j + k > n) continue;
    for (let m = 0; m < k && ok; m++) {
      const a = norm(words[i + m]!.text);
      const b = norm(words[j + m]!.text);
      if (mark[j + m]) ok = false;
      else if (m === k - 1 && cutOff) ok = b.startsWith(a);
      else ok = a === b;
    }
    if (!ok) continue;
    // evidence of a restart; without it, a repeat is deliberate ("you can do it, you can do it")
    const gap = words[j]!.startMs - words[i + k - 1]!.endMs;
    if (!(cutOff || j > i + k || gap >= RESTART_GAP_MS)) continue;
    // the last take goes on past the repeated words; a phrase said twice and left there is emphasis
    const continues = j + k < n && !SENTENCE_END.test(words[j + k - 1]!.text.trim());
    if (!continues && !cutOff) continue;
    return k;
  }
  return 0;
}
