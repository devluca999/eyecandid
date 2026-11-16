#!/usr/bin/env bash
# Runs inside the CI emulator step. The app talks to the runner's local Convex through adb reverse,
# and the fixture clip is put in the emulator's gallery so the flow imports it through the real system picker.
set -euo pipefail
adb reverse tcp:3210 tcp:3210
adb reverse tcp:3211 tcp:3211
# shared storage comes up a little after boot: the first push can be refused
for i in $(seq 1 30); do
  adb push services/engine/tests/fixtures/talk.mp4 /sdcard/Movies/eyelore-talk.mp4 && break
  sleep 3
done
adb shell ls -l /sdcard/Movies/eyelore-talk.mp4
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Movies/eyelore-talk.mp4 >/dev/null
adb install -r app.apk
maestro test apps/mobile/.maestro --format junit --output maestro-report.xml --debug-output maestro-debug --flatten-debug-output
