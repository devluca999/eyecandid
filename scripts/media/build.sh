#!/usr/bin/env bash
# Download the landing's Mixkit clips and build the self-hosted loops in apps/web/public/media/.
#   scripts/media/build.sh            # all clips in clips.tsv
#   scripts/media/build.sh 32800 236  # just these
# Needs curl and ffmpeg. Raw downloads go to scripts/media/.raw/ (git-ignored). The site never loads assets.mixkit.co.
#
# Per clip: a seamless loop (the last FADE seconds crossfade into the first frame), no audio, then
#   <id>-720.mp4  H.264, short side 720, ~1.6 Mbps cap      <id>-720.webm  VP9, short side 720
#   <id>-480.mp4  H.264, short side 480 (phones, small tiles) <id>-480.webm  VP9, short side 480
#   <id>.jpg      poster: the loop's first frame, short side 360
# POSTERS_ONLY=1 rebuilds just the posters.
#
# Every loop is 30 fps. With two or more clips playing and no input, Chrome composites the page at 30 Hz, and a
# 24 fps clip on a 30 Hz cadence holds every fourth frame twice as long (33/33/33/67 ms): the stutter measured by
# apps/web/scripts/perf/landing-video.mjs. 30 fps divides 30, 60 and 120 Hz evenly. The sources are 24 or 25 fps, so:
#   RETIME=speed  (default) plays every source frame once, 1.25× (or 1.2×) faster; nothing is synthesised, and a
#                 loop_s of 5 in clips.tsv (source seconds) becomes a 4 s loop
#   RETIME=interp keeps the original tempo and synthesises the in-between frames (motion interpolation; fast hands
#                 and feet can ghost)
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
raw="$here/.raw"
out="$here/../../apps/web/public/media"
FADE=0.6
FPS=30
RETIME="${RETIME:-speed}"
mkdir -p "$raw" "$out"

only=" $* "
while IFS=$'\t' read -r id start loop crop _why; do
  [[ -z "$id" || "$id" == \#* ]] && continue
  [[ "$only" != "  " && "$only" != *" $id "* ]] && continue
  src="$raw/$id.mp4"
  [[ -s "$src" ]] || curl -sfL </dev/null -o "$src" "https://assets.mixkit.co/videos/$id/$id-720.mp4"

  read -r w h rate < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height,avg_frame_rate -of csv=p=0 "$src" | tr ',' ' ')
  # the source's own frame rate, rounded (23.976 → 24); anything faster than FPS is brought down to it
  nat=$(echo "r = ($rate) + 0.5; scale = 0; n = r / 1; if (n > $FPS) n = $FPS; n" | bc -l)
  if [[ "$RETIME" == interp ]]; then
    retime="minterpolate=fps=$FPS:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1"
  else
    retime="setpts=PTS*$nat/$FPS,fps=$FPS"
  fi
  if [[ "$crop" == sq:* ]]; then
    x="${crop#sq:}"
    pre="crop=ih:ih:'max(0,min(iw-ih,iw*$x-ih/2))':0,"
  else
    pre=""
  fi
  # seg = [start, start+loop+FADE]; out = xfade(seg[FADE..], seg[0..FADE]) at loop-FADE → ends on seg(FADE) = its first frame
  len=$(echo "$loop + $FADE" | bc)
  off=$(echo "$loop - $FADE" | bc)
  loopf="[0:v]${pre}fps=$nat,format=yuv420p,split[a][b];[a]trim=start=$FADE:end=$len,setpts=PTS-STARTPTS[main];[b]trim=0:$FADE,setpts=PTS-STARTPTS[head];[main][head]xfade=transition=fade:duration=$FADE:offset=$off"
  tmp="$raw/$id-loop.mkv"
  ffmpeg -nostdin -v error -y -ss "$start" -t "$len" -i "$src" -filter_complex "$loopf,format=yuv420p" -an -c:v libx264 -crf 12 -preset fast "$tmp"

  [[ -n "${POSTERS_ONLY:-}" ]] || for s in 720 480; do
    if (( w >= h )) || [[ "$crop" == sq:* ]]; then sc="scale=-2:$s"; else sc="scale=$s:-2"; fi
    # the caps are per second: the same frames now go by 1.25× faster, so the caps rise with them (file sizes barely move)
    if [[ $s == 720 ]]; then mr=1625k; vb=1000k; crf=27; vcrf=38; else mr=810k; vb=475k; crf=28; vcrf=40; fi
    ffmpeg -nostdin -v error -y -i "$tmp" -vf "$retime,$sc" -an -c:v libx264 -profile:v high -preset slow -crf $crf -maxrate $mr -bufsize $mr \
      -pix_fmt yuv420p -movflags +faststart "$out/$id-$s.mp4"
    ffmpeg -nostdin -v error -y -i "$tmp" -vf "$retime,$sc" -an -c:v libvpx-vp9 -crf $vcrf -b:v $vb -maxrate $mr -bufsize $mr -row-mt 1 \
      -deadline good -cpu-used 2 -pix_fmt yuv420p "$out/$id-$s.webm"
  done
  # posters stay small: they paint before any video and compete with the page's own first bytes
  if (( w >= h )) || [[ "$crop" == sq:* ]]; then sc="scale=-2:360"; else sc="scale=360:-2"; fi
  ffmpeg -nostdin -v error -y -i "$tmp" -vf "$sc" -frames:v 1 -q:v 7 "$out/$id.jpg"
  rm -f "$tmp"
  printf '%-6s %s\n' "$id" "$(cd "$out" && ls -l "$id"-* "$id".jpg | awk '{printf "%s=%dK ", $9, $5/1024}')"
done < "$here/clips.tsv"
du -sh "$out"
