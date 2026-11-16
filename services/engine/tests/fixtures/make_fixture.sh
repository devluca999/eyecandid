#!/bin/sh
# Builds talk.mp4: 640x360 test pattern + synthetic speech with fillers, a repeat and a long pause (macOS `say`).
# Committed output is what CI uses; rerun only to change the script.
set -e
cd "$(dirname "$0")"
say -v Samantha -o talk.aiff "Um, this ring tracks my sleep. [[slnc 1400]] It it lasts a whole week on one charge. You know, I wear it to bed every night. Link below."
ffmpeg -v error -y -f lavfi -i "testsrc=size=640x360:rate=15" -i talk.aiff -shortest \
  -c:v libx264 -preset veryfast -crf 38 -pix_fmt yuv420p -c:a aac -b:a 64k -ac 1 talk.mp4
rm talk.aiff
