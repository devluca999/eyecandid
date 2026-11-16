#!/usr/bin/env bash
# Runs inside the CI emulator step. The app talks to the runner's local Convex through adb reverse,
# and the fixture clip is put in the emulator's gallery so the flow imports it through the real system picker.
set -euo pipefail
adb reverse tcp:3210 tcp:3210
adb reverse tcp:3211 tcp:3211
adb push services/engine/tests/fixtures/talk.mp4 /sdcard/Movies/eyelore-talk.mp4
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Movies/eyelore-talk.mp4 >/dev/null
# wait until the gallery knows the clip (the photo picker reads MediaStore, not the filesystem)
for i in $(seq 1 30); do
  adb shell content query --uri content://media/external/video/media --projection _display_name | grep -q eyelore-talk && break
  sleep 2
done
adb shell content query --uri content://media/external/video/media --projection _display_name:duration
adb install -r app.apk
maestro test apps/mobile/.maestro --format junit --output maestro-report.xml --debug-output maestro-debug --flatten-debug-output
