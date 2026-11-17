import type { JobInput, JobOutput } from "./jobs";

/**
 * Autocut on word timings — the TypeScript twin of services/engine/eyelore_engine/handlers/autocut.py, kept
 * behaviour-identical (same tests) so the in-browser engine (free tier) and the server engine cut the same way.
 * Strikes fillers, stutter repeats and long pauses (struck, never deleted) and splits beads at sentences.
 * Polishes how it was said, never what was said.
 */
type Word = { text: string; startMs: number; endMs: number; conf?: number };

const SENTENCE_END = /[.!?]$/;
// spelling variants ASR produces for the same hesitation: um/umm/ummm, uh/uhh, er/erm, hm/hmm, ah
const FILLER_SOUND = /^(u+m+|u+h+|e+r+m*|h+m+|a+h+)$/;
const SPLIT_PAUSE_MS = 650;
const SOFT_MAX_WORDS = 14;
const HARD_MAX_WORDS = 24;
const DEFAULT_FILLERS = ["um", "uh", "erm", "like", "you know", "so", "basically"];

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}_' ]/gu, "").trim();

export function autocut(input: Pick<JobInput<"autocut">, "words"> & Partial<JobInput<"autocut">>): JobOutput<"autocut"> {
  const words: Word[] = input.words;
  const minSil = input.minSilenceMs ?? 450;
  const fillers = new Set((input.fillers ?? DEFAULT_FILLERS).map((f) => f.toLowerCase()));
  const multi = [...fillers].filter((f) => f.includes(" ")).map((f) => f.split(" "));
  const strikes: JobOutput<"autocut">["strikes"] = [];

  let i = 0;
  while (i < words.length) {
    const w = words[i]!;
    let matched = false;
    for (const phrase of multi) {
      const seg = words.slice(i, i + phrase.length).map((x) => norm(x.text));
      if (seg.length === phrase.length && seg.every((s, k) => s === phrase[k])) {
        const end = words[i + phrase.length - 1]!;
        strikes.push({ startMs: w.startMs, endMs: end.endMs, kind: "filler", reason: `trimmed filler · '${phrase.join(" ")}'` });
        i += phrase.length;
        matched = true;
        break;
      }
    }
    if (matched) continue;
    const n = norm(w.text);
    const prev = words[i - 1];
    if (FILLER_SOUND.test(n)) {
      strikes.push({ startMs: w.startMs, endMs: w.endMs, kind: "filler", reason: `trimmed filler · '${n}'` });
    } else if (fillers.has(n) && n !== "so" && n !== "like") {
      strikes.push({ startMs: w.startMs, endMs: w.endMs, kind: "filler", reason: `trimmed filler · '${n}'` });
    } else if (n === "so" || n === "like") {
      // only fillers when isolated by pauses
      const gapBefore = prev ? w.startMs - prev.endMs : 10_000;
      const next = words[i + 1];
      const gapAfter = next ? next.startMs - w.endMs : 10_000;
      if (gapBefore > 250 && gapAfter > 250) strikes.push({ startMs: w.startMs, endMs: w.endMs, kind: "filler", reason: `trimmed filler · '${n}'` });
    } else if (
      prev &&
      n &&
      n === norm(prev.text) &&
      // a stutter: same word back to back within one sentence ("it it"), not "…take it. It tracks"
      !SENTENCE_END.test(prev.text.trim()) &&
      !prev.text.trimEnd().endsWith(",") &&
      w.startMs - prev.endMs < 400
    ) {
      strikes.push({ startMs: w.startMs, endMs: w.endMs, kind: "repeat", reason: `trimmed repeat · '${n}'` });
    }
    i++;
  }

  for (let k = 0; k + 1 < words.length; k++) {
    const a = words[k]!;
    const b = words[k + 1]!;
    const gap = b.startMs - a.endMs;
    if (gap >= minSil) {
      const keep = 120; // a breath on each side
      strikes.push({ startMs: a.endMs + keep, endMs: b.startMs - keep, kind: "silence", reason: `trimmed pause · ${(gap / 1000).toFixed(1)}s` });
    }
  }

  const beads: JobOutput<"autocut">["beads"] = [];
  let start = words[0]?.startMs ?? 0;
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
      beads.push({ inMs: start, outMs: w.endMs });
      if (!last) start = words[idx + 1]!.startMs;
    }
  });
  if (beads.length) {
    beads[0]!.moment = "hook";
    if (beads.length > 1) beads[beads.length - 1]!.moment = "cta";
  }
  strikes.sort((a, b) => a.startMs - b.startMs);
  return { strikes, beads };
}
