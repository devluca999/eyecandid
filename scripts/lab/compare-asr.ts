// Compares Whisper builds' word timings and cuts against the first (reference) build.
//   npx tsx scripts/lab/compare-asr.ts <results.json>
// results.json: [{ name, out: { [clip]: { seconds, chunks: [{ text, ts: [start, end] }] } } }] (a lab run's output).
// Per clip and build: words matched (same normalised text, in order), mean |start| and |end| delta in ms, and the
// server autocut on those words (packages/core): struck words, strikes by kind, beads, the same as the reference or not.
import { readFileSync } from "node:fs";
import { autocut } from "../../packages/core/src/autocut";
import { wordsFromChunks } from "../../apps/web/lib/asr-words";

type Run = { name: string; error?: string; out?: Record<string, { seconds: number; warmMs: number; firstMs: number; chunks: { text: string; ts: [number | null, number | null] }[] }> };
const runs: Run[] = JSON.parse(readFileSync(process.argv[2]!, "utf8"));
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9']/g, "");

/** longest common subsequence on normalised words: the pairs that match, in order */
function lcs(a: string[], b: string[]): [number, number][] {
  const d = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) d[i]![j] = a[i] === b[j] ? d[i + 1]![j + 1]! + 1 : Math.max(d[i + 1]![j]!, d[i]![j + 1]!);
  const out: [number, number][] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length; ) {
    if (a[i] === b[j]) out.push([i++, j++]);
    else if (d[i + 1]![j]! >= d[i]![j + 1]!) i++;
    else j++;
  }
  return out;
}

const ref = runs[0]!;
for (const clip of Object.keys(ref.out ?? {})) {
  console.log(`\n== ${clip}`);
  const rw = wordsFromChunks(ref.out![clip]!.chunks.map((c) => ({ text: c.text, timestamp: c.ts })), ref.out![clip]!.seconds);
  const rc = autocut({ words: rw.map((w) => ({ ...w, conf: 1 })) });
  for (const r of runs) {
    if (!r.out) {
      console.log(`${r.name.padEnd(28)} FAILED ${r.error}`);
      continue;
    }
    const o = r.out[clip]!;
    const w = wordsFromChunks(o.chunks.map((c) => ({ text: c.text, timestamp: c.ts })), o.seconds);
    const pairs = lcs(rw.map((x) => norm(x.text)), w.map((x) => norm(x.text)));
    const ds = pairs.map(([i, j]) => Math.abs(rw[i]!.startMs - w[j]!.startMs));
    const de = pairs.map(([i, j]) => Math.abs(rw[i]!.endMs - w[j]!.endMs));
    const mean = (a: number[]) => (a.length ? Math.round(a.reduce((x, y) => x + y, 0) / a.length) : 0);
    const cut = autocut({ words: w.map((x) => ({ ...x, conf: 1 })) });
    const kinds = (c: typeof cut) => c.strikes.reduce<Record<string, number>>((m, s) => ((m[s.kind] = (m[s.kind] ?? 0) + 1), m), {});
    const struck = (c: typeof cut, ws: typeof w) => c.strikes.filter((s) => s.kind !== "silence").flatMap((s) => ws.filter((x) => x.startMs >= s.startMs && x.endMs <= s.endMs).map((x) => norm(x.text)));
    const same = JSON.stringify(kinds(cut)) === JSON.stringify(kinds(rc)) && cut.beads.length === rc.beads.length && JSON.stringify(struck(cut, w)) === JSON.stringify(struck(rc, rw));
    console.log(
      `${r.name.padEnd(28)} ${String(w.length).padStart(3)} words · matched ${pairs.length}/${rw.length} · |start| ${mean(ds)} ms · |end| ${mean(de)} ms · warm ${o.warmMs} ms (first ${o.firstMs}) · strikes ${JSON.stringify(kinds(cut))} struck [${struck(cut, w).join(" ")}] · beads ${cut.beads.length} · cut ${same ? "same" : "DIFFERS"}`,
    );
    if (r === ref || clip === "gate.wav") console.log(`   "${w.map((x) => x.text).join(" ")}"`);
  }
}
