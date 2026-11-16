#!/usr/bin/env bash
# Runs inside the CI emulator step. The app talks to the runner's local Convex through adb reverse,
# and the fixture clip is put in the emulator's gallery so the flow imports it through the real system picker.
set -euo pipefail
mkdir -p maestro-debug
on_fail() {
  # what was on screen when it went wrong (selectors for the system picker are the usual suspect)
  adb exec-out screencap -p > maestro-debug/last-screen.png || true
  adb shell uiautomator dump /sdcard/ui.xml > /dev/null 2>&1 && adb pull /sdcard/ui.xml maestro-debug/last-screen.xml > /dev/null 2>&1 || true
  adb logcat -d -t 400 '*:E' ReactNativeJS:V > maestro-debug/logcat.txt 2>&1 || true
}
trap on_fail ERR
videos() { adb shell content query --uri content://media/external/video/media --projection _display_name:width:height:duration; }

adb reverse tcp:3210 tcp:3210
adb reverse tcp:3211 tcp:3211
# shared storage comes up a little after boot: the first push can be refused
for i in $(seq 1 30); do
  adb push services/engine/tests/fixtures/talk.mp4 /sdcard/Movies/eyelore-talk.mp4 && break
  sleep 3
done
adb shell ls -l /sdcard/Movies/eyelore-talk.mp4
adb shell am broadcast -a android.intent.action.MEDIA_SCANNER_SCAN_FILE -d file:///sdcard/Movies/eyelore-talk.mp4 >/dev/null
# wait until the gallery knows the clip (the photo picker reads MediaStore, not the filesystem)
for i in $(seq 1 30); do
  videos | grep -q eyelore-talk && break
  sleep 2
done
videos
adb install -r app.apk

maestro test apps/mobile/.maestro --format junit --output maestro-report.xml --debug-output maestro-debug --flatten-debug-output

# the proof, measured: the flow's own duration, and the exported video sitting in the gallery
python3 - <<'PY'
import sys, xml.etree.ElementTree as ET
cases = list(ET.parse("maestro-report.xml").getroot().iter("testcase"))
total = sum(float(c.get("time") or 0) for c in cases)
print(f"maestro: {len(cases)} flow(s), {total:.0f}s in total")
sys.exit(0 if cases and total < 180 else f"the core loop took {total:.0f}s: over the 3 minute bound")
PY
videos | tee maestro-debug/gallery.txt
grep -v eyelore-talk maestro-debug/gallery.txt | grep -q 'width=1080, height=1920' || { echo "no 1080x1920 export in the gallery"; exit 1; }
