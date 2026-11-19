/**
 * Golden-set evaluation of the automatic cut.
 *   pnpm eval [--dir eval/golden] [--json] [--min-f1 0.8]
 *   pnpm eval --from-editdoc <editdoc.json> --id <case-id> [--clip <clipId>] [--out eval/golden/editor/<id>.json] [--notes "..."]
 * Scores core `autocut` against each GoldenCase's editor reference and writes eval/out/latest.json.
 * See eval/README.md. Fixtures with source "example" are format examples, not evidence of quality.
 */
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { GoldenCase, autocut, goldenFromEditDoc, keptRanges, scoreCut, summarise, type CutScore } from "../../packages/core/src/index";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
// `pnpm eval` runs inside packages/core, so user-supplied paths resolve against where the user typed the command
const cwd = process.env.INIT_CWD ?? process.cwd();
const args = process.argv.slice(2);
const flag = (name: string) => (args.includes(name) ? args[args.indexOf(name) + 1] : undefined);
const has = (name: string) => args.includes(name);
const fail = (msg: string): never => {
  console.error(msg);
  process.exit(2);
};

if (has("--from-editdoc")) {
  const file = flag("--from-editdoc") ?? fail("--from-editdoc needs a file");
  const id = flag("--id") ?? fail("--from-editdoc needs --id <case-id>");
  const golden = goldenFromEditDoc(JSON.parse(readFileSync(resolve(cwd, file), "utf8")), { id, clipId: flag("--clip"), notes: flag("--notes") });
  const out = resolve(cwd, flag("--out") ?? join(root, "eval/golden/editor", `${id}.json`));
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, JSON.stringify(golden, null, 2) + "\n");
  console.log(`wrote ${out} · ${golden.words.length} words · ${golden.reference.keep.length} kept ranges`);
  process.exit(0);
}

const dir = resolve(cwd, flag("--dir") ?? join(root, "eval/golden"));
const minF1Raw = flag("--min-f1");
const minF1 = minF1Raw === undefined ? undefined : Number(minF1Raw);
if (minF1 !== undefined && !Number.isFinite(minF1)) fail("--min-f1 needs a number");

function listJson(d: string): string[] {
  return readdirSync(d)
    .sort()
    .flatMap((n) => {
      const p = join(d, n);
      return statSync(p).isDirectory() ? listJson(p) : n.endsWith(".json") ? [p] : [];
    });
}

let files: string[];
try {
  files = listJson(dir);
} catch {
  files = [];
  fail(`cannot read directory ${dir}`);
}
if (!files.length) fail(`no *.json golden cases under ${dir}`);

type Row = { id: string; source: string; file: string; words: number; score: CutScore };
const rows: Row[] = files.map((file) => {
  const parsed = GoldenCase.safeParse(JSON.parse(readFileSync(file, "utf8")));
  if (!parsed.success) return fail(`${relative(cwd, file)} is not a valid GoldenCase: ${parsed.error.message}`);
  const c = parsed.data;
  const durationMs = c.durationMs ?? Math.max(...c.words.map((w) => w.endMs));
  const auto = keptRanges(c.words, autocut({ words: c.words }));
  return { id: c.id, source: c.source ?? "unspecified", file: relative(root, file), words: c.words.length, score: scoreCut(auto, c.reference.keep, durationMs, c.words) };
});

const summary = summarise(rows.map((r) => r.score));
const examplesOnly = rows.every((r) => r.source === "example");
const report = { generatedAt: new Date().toISOString(), dir: relative(root, dir), examplesOnly, cases: rows.map((r) => ({ id: r.id, source: r.source, file: r.file, ...r.score })), summary };
const outFile = join(root, "eval/out/latest.json");
mkdirSync(dirname(outFile), { recursive: true });
writeFileSync(outFile, JSON.stringify(report, null, 2) + "\n");

const pct = (x: number) => (x * 100).toFixed(1).padStart(5);
const ms = (x: number | null) => (x === null ? "  n/a" : String(Math.round(x)).padStart(5));
if (has("--json")) {
  console.log(JSON.stringify(report, null, 2));
} else {
  if (examplesOnly) console.log("examples only · no editor references yet (scores below show the format works, not how good the cut is)\n");
  const idw = Math.max(4, ...rows.map((r) => r.id.length));
  console.log(["case".padEnd(idw), "source ", " prec%", "  rec%", "   f1%", "  iou%", "p50ms", "p90ms", "extra", "miss", "midword"].join("  "));
  const line = (id: string, s: { precision: number; recall: number; f1: number; iou: number; p50: number | null; p90: number | null; extra: number; miss: number; mid: number }, src: string) =>
    [id.padEnd(idw), src.padEnd(7), pct(s.precision), pct(s.recall), pct(s.f1), pct(s.iou), ms(s.p50), ms(s.p90), String(s.extra).padStart(5), String(s.miss).padStart(4), String(s.mid).padStart(7)].join("  ");
  for (const r of rows) {
    const s = r.score;
    console.log(line(r.id, { ...s, p50: s.boundaryErrorMs.p50, p90: s.boundaryErrorMs.p90, extra: s.extraCuts, miss: s.missedCuts, mid: s.midWordCuts }, r.source));
  }
  console.log("-".repeat(idw + 70));
  console.log(line(`mean of ${summary.cases}`, { ...summary, p50: summary.boundaryErrorMs.p50, p90: summary.boundaryErrorMs.p90, extra: summary.extraCuts, miss: summary.missedCuts, mid: summary.midWordCuts }, ""));
  console.log(`\nwin rate vs human editor: not measured (needs ~200 editor-cut clips and blind raters)`);
  console.log(`wrote ${relative(root, outFile)}`);
}

if (minF1 !== undefined && summary.f1 < minF1) {
  console.error(`mean F1 ${summary.f1.toFixed(3)} is below --min-f1 ${minF1}`);
  process.exit(1);
}
