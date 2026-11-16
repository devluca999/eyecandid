#!/usr/bin/env bash
# Runs inside the CI emulator step. The app talks to the runner's local Convex through adb reverse.
set -euo pipefail
adb reverse tcp:3210 tcp:3210
adb reverse tcp:3211 tcp:3211
adb install -r app.apk
maestro test apps/mobile/.maestro --format junit --output maestro-report.xml --debug-output maestro-debug --flatten-debug-output
