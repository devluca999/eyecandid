/**
 * Autocut inputs shared by the TS and Python engines. `pnpm --filter @eyelore/core fixtures:autocut` runs the TS
 * autocut over them and writes autocut-cases.json; both test suites check their engine reproduces it exactly.
 */
type W = { text: string; startMs: number; endMs: number; conf: number };
export type AutocutCase = { name: string; input: { words: W[]; minSilenceMs: number; fillers: string[] } };

/** Words laid out from `t0`: a number before a word is the pause before it (default 50ms), each word 250ms long. */
export function say(spec: (string | number)[], t0 = 0, len = 250): W[] {
  const out: W[] = [];
  let t = t0;
  let gap = 0;
  for (const x of spec) {
    if (typeof x === "number") {
      gap = x;
      continue;
    }
    t += out.length ? gap || 50 : gap;
    out.push({ text: x, startMs: t, endMs: t + len, conf: 1 });
    t += len;
    gap = 0;
  }
  return out;
}

const c = (name: string, words: W[], fillers: string[] = [], minSilenceMs = 450): AutocutCase => ({ name, input: { words, minSilenceMs, fillers } });

export const NAMED: AutocutCase[] = [
  c("false start after a pause", say(["so", "today", "we", 300, "so", "today", "we", "are", "going", "to", "talk."])),
  c("a changed word is not a repeat", say(["so", "today", "we", 300, "so", "today", "we're", "going", "to", "talk."])),
  c("false start with a filler between", say(["i", "think", "um", "i", "think", "it's", "great."])),
  c("false start ending in a cut-off word", say(["so", "we-", "so", "we're", "going", "home."])),
  c("false start chain keeps the last", say(["so", "today", 300, "so", "today", 300, "so", "today", "we", "talk."])),
  c("rhetorical repeat without a pause", say(["you", "can", "do", "it,", "you", "can", "do", "it!"])),
  c("rhetorical repeat that ends the sentence", say(["you", "can", "do", "it,", 300, "you", "can", "do", "it!"])),
  c("never never give up", say(["never,", "never", "give", "up."])),
  c("i came i saw", say(["i", "came,", "i", "saw,", "i", "conquered."])),
  c("bye bye", say(["okay", "bye", "bye."])),
  c("so so good", say(["it's", "so", "so", "good."])),
  c("a finished sentence is not a false start", say(["i", "did", "it.", 300, "i", "did", "it", "again."])),
  c("full retake", say(["so", "today", "we're", "going", "to", "talk", "about", "rings.", 800, "so", "today", "we're", "going", "to", "talk", "about", "sleep", "rings."])),
  c("three takes keep the last", say(["this", "ring", "tracks", "your", "sleep.", 700, "this", "ring", "tracks", "your", "sleep", "well.", 900, "this", "ring", "tracks", "your", "sleep", "really", "well."])),
  c("anaphora is not a retake", say(["we", "will", "fight", "on", "the", "beaches.", 400, "we", "will", "fight", "on", "the", "landing", "grounds."])),
  c("short emphatic repeat is not a retake", say(["this", "is", "huge.", 400, "this", "is", "huge."])),
  c("pause between kept words", say(["a", 1000, "b."])),
  c("short pause keeps 45% each side at most", say(["a", 200, "b."]), [], 200),
  c("filler swallows the pauses around it", say(["this", 400, "um", 400, "works."]), ["um"]),
  c("filler in tight speech is cut on its word", say(["this", "um", "works."]), ["um"]),
  c("filler at the clip start", say(["um", 600, "hello", "there."]), ["um"]),
  c("two fillers in a row", say(["this", 500, "um", 100, "uh", 500, "works."]), ["um", "uh"]),
  c("stutter stays a stutter", say(["it", "it", "lasts", "a", "week."])),
];

/** Deterministic random-ish takes (LCG), for the parity and no-kept-word-cut invariants. */
export function randomCases(count: number, seed = 7): AutocutCase[] {
  let s = seed >>> 0;
  const rnd = () => (s = (Math.imul(s, 1103515245) + 12345) >>> 0) / 2 ** 32;
  const vocab = ["so", "today", "we", "we're", "um", "uh", "like", "you", "know", "this", "ring", "tracks", "sleep", "it", "lasts", "a", "week", "basically", "w-", "the"];
  const gaps = [0, 20, 50, 80, 150, 210, 300, 460, 700, 1200];
  const out: AutocutCase[] = [];
  for (let k = 0; k < count; k++) {
    const words: W[] = [];
    let t = Math.floor(rnd() * 300);
    const n = 6 + Math.floor(rnd() * 30);
    for (let i = 0; i < n; i++) {
      // sometimes say the last few words again
      if (i > 3 && rnd() < 0.15) {
        const back = 2 + Math.floor(rnd() * 3);
        for (const w of words.slice(-back)) {
          t += gaps[Math.floor(rnd() * gaps.length)]!;
          const len = w.endMs - w.startMs;
          words.push({ text: w.text.replace(/[.,]$/, ""), startMs: t, endMs: t + len, conf: 1 });
          t += len;
        }
        continue;
      }
      t += gaps[Math.floor(rnd() * gaps.length)]!;
      const len = 60 + Math.floor(rnd() * 400);
      const punct = rnd() < 0.12 ? "." : rnd() < 0.1 ? "," : "";
      words.push({ text: vocab[Math.floor(rnd() * vocab.length)]! + punct, startMs: t, endMs: t + len, conf: 1 });
      t += len;
    }
    out.push(c(`random ${k}`, words, ["um", "uh", "like", "you know", "so", "basically"], [200, 450, 700][k % 3]!));
  }
  return out;
}
