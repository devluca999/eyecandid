# Cut evaluation (golden set)

Answers one question with a number: how close is the automatic cut to what a human editor would keep?

## Status

**No editor references exist yet.** Everything under `eval/golden/examples/` is hand-written to show the file format. Scores on those files demonstrate that the harness runs. They say nothing about how good the cut is, and must never be quoted as product quality. The runner says so when every case is an example.

The north star from `docs/pricing-and-quality-plan.md` (items 7 and 8) is a **blind pairwise win rate of at least 50% against a human editor**. It is **NOT YET MEASURED**. It needs:

- about 200 raw talking-head clips (15 to 90 s, creators and UGC ads) supplied by the owner, each with a human editor's reference cut;
- blind raters comparing our edit against the editor's (and against Captions and Submagic) without knowing which is which.

`winRate` exists as a field on the summary type and is always `undefined` until that test is built. Nothing here computes or estimates it.

## Run

```
pnpm eval                              # every *.json under eval/golden/ (recursive)
pnpm eval --dir path/to/cases          # another directory
pnpm eval --json                       # print the report as JSON instead of the table
pnpm eval --min-f1 0.8                 # exit 1 when mean F1 is below 0.8 (default: off)
```

Each run writes `eval/out/latest.json` (git-ignored). The runner calls core `autocut` on the case's words with default settings, so it scores the same cut the app produces.

## File format

One `GoldenCase` JSON file per clip (schema: `GoldenCase` in `packages/core/src/eval.ts`):

```json
{
  "id": "creator-0042",
  "source": "editor",
  "words": [{ "text": "um", "startMs": 0, "endMs": 300, "conf": 1 }],
  "reference": { "keep": [{ "startMs": 400, "endMs": 3700 }] },
  "durationMs": 61000,
  "notes": "optional free text"
}
```

- `words`: ASR word timings of the raw clip, as the `transcribe` job returns them. All times are source-clip milliseconds.
- `reference.keep`: the source-time ranges the human editor kept. Everything else counts as removed.
- `durationMs`: length of the raw clip. Optional; defaults to the end of the last word.
- `source`: `"editor"` for a real human reference, `"example"` for a format example. Only `"example"` is treated as non-evidence.

## Producing a reference

1. **From any NLE.** Export the kept clips as a list of in and out times on the source clip (an EDL, XML, or just the numbers), convert to milliseconds, and put them in `reference.keep`. Take `words` from the project's transcript.
2. **From Eyecandid.** Have the editor make the cut in Eyecandid (restore what they want, strike what they do not), export the edit doc JSON, then:

```
pnpm eval --from-editdoc exported-doc.json --id creator-0042 [--clip <clipId>] [--notes "..."] [--out path.json]
```

The converter parses the doc with the core `EditDoc` schema, derives `keep` from `toTimeline(doc).segments` (source ranges of what the edit plays, merged), takes `words` from the doc's beads, and writes `eval/golden/editor/<id>.json` by default with `source: "editor"`. Only use it on docs a human edited; it does not check.

Note that `toTimeline` keeps a small handle next to struck words (`WORD_HANDLE_MS`), so a reference from an edit doc can differ from an NLE reference by tens of milliseconds at word edges.

## Metrics

Scored over the window `[0, durationMs]`. The automatic cut keeps the spoken span (first word start to last word end) minus its strikes, so leading and trailing silence count as removed.

- **precision**: of the time we removed, the share the editor also removed. Low means we cut things the editor kept. (1 if we removed nothing.)
- **recall**: of the time the editor removed, the share we also removed. Low means we left in what the editor cut. (1 if the editor removed nothing.)
- **f1**: harmonic mean of precision and recall over removed time.
- **iou**: kept-time intersection over union with the editor's cut. 1 means identical cuts.
- **removedMsAuto / removedMsRef**: total removed time for us and for the editor.
- **boundaryErrorMs p50 / p90**: how far our cut points are from the editor's, in ms, over boundaries that matched (nearest-rank percentiles; `null` if none matched).
- **extraCuts**: our cut boundaries with no editor boundary within 500 ms. Boundaries are matched one to one, closest pairs first.
- **missedCuts**: editor cut boundaries with none of ours within 500 ms.
- **midWordCuts**: our cut boundaries strictly inside a word's `[startMs, endMs]`. Should be 0.
- **summary**: means of precision, recall, f1, iou and the per-case boundary percentiles; totals of the cut counts; `winRate` is `undefined` (see above).

## Labels

`packages/core/src/labels.ts` turns a user's edit into labels: `labelsFromChange(before, change)` returns `restore` (we cut something the user wanted back), `strike` (the user cut something we kept), `pin`, and `caption_edit`. Only changes with actor `user` yield labels; autopilot changes yield none.

Now stored. Every edit by a person (`edits.apply`) writes its labels in the same transaction into the `editLabels` table. A row holds: `projectId`, `kind`, `atMs` and `spanMs` (source-clip milliseconds), `strikeKind` (where known), `docVersion` (the version the change produced), `at`, and `owner` as a hash (`a:<anon hash>` or `u:<hash of user id>`). It holds no word text, no caption text and no email. At most 200 rows per project. Undo writes no label and takes back the labels of the change it undid. Deleting the edit deletes its labels.

Read them with the token-gated query `labels.summary` (`{ token, days? }`, same `EYELORE_ADMIN_TOKEN` as /funnel; days defaults to 30). It returns counts by kind and by `kind:strikeKind`, reads at most 2000 newest rows per kind, and sets `truncated` (read the counts as "at least") when it hits that.

For offline tuning, `labels:exportLabels` (internal, so only the Convex dashboard or CLI can call it) pages through rows: `limit` defaults to 200 and is clamped to 500; pass the returned `cursor` back until `done`.
Example, against a dev deployment only: `npx convex run labels:exportLabels '{"kind":"restore","sinceMs":1760000000000,"limit":200}'`.

Not done: tuning thresholds from labels, per person or globally, is still manual. Implicit pins (a user edit pins the paths it touches) are not labelled; only an explicit insert into `/pins` is.
