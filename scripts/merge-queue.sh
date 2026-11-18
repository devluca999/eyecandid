#!/usr/bin/env bash
# Merge PRs in order, each only after green CI on its up-to-date head. Stops at the first problem.
#   scripts/merge-queue.sh 28 29 30
# Per PR: update the branch from main → wait for the ci.yml run on that exact head SHA → squash-merge only if every
# check is pass or skipping. Stops (exit 1) on a conflict, a red check, or a missing run. Never pushes to main itself.
# Run one queue at a time: two queues race on main. Optional: MERGE_TRAILER="Co-Authored-By: …" appended to the body.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"
for PR in "$@"; do
  echo "== #$PR $(date -u +%H:%M)"
  out=$(gh pr update-branch "$PR" 2>&1); echo "   update: $out" | head -2
  if echo "$out" | grep -qi "conflict"; then echo "   STOP: #$PR has conflicts with main"; exit 1; fi
  sleep 20
  SHA=$(gh pr view "$PR" --json headRefOid --jq .headRefOid)
  BR=$(gh pr view "$PR" --json headRefName --jq .headRefName)
  RID=""
  for _ in $(seq 1 30); do
    RID=$(gh run list --branch "$BR" --workflow ci.yml -L 5 --json databaseId,headSha --jq ".[] | select(.headSha==\"$SHA\") | .databaseId" | head -1)
    [ -n "$RID" ] && break; sleep 10
  done
  [ -z "$RID" ] && { echo "   STOP: no CI run for $SHA"; exit 1; }
  gh run watch "$RID" --interval 30 > /dev/null 2>&1
  bad=$(gh pr checks "$PR" 2>/dev/null | awk -F'\t' '$2!="pass" && $2!="skipping" {print $1": "$2}')
  if [ -n "$bad" ]; then echo "   STOP: #$PR checks not green:"; echo "$bad" | sed 's/^/     /'; exit 1; fi
  TITLE=$(gh pr view "$PR" --json title --jq .title)
  gh pr merge "$PR" --squash --subject "$TITLE (#$PR)" --body "Merged on green CI by scripts/merge-queue.sh.${MERGE_TRAILER:+

$MERGE_TRAILER}" > /dev/null 2>&1
  st=$(gh pr view "$PR" --json state --jq .state); echo "   #$PR $st"
  [ "$st" != "MERGED" ] && { echo "   STOP: merge of #$PR did not complete"; exit 1; }
done
echo "== queue done $(date -u +%H:%M)"
