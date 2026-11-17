#!/usr/bin/env bash
# Download the landing's Mixkit clips and build the self-hosted loops in apps/web/public/media/.
#   scripts/media/build.sh            # all clips in clips.tsv
#   scripts/media/build.sh 32800 236  # just these
# Needs curl and ffmpeg. Raw downloads go to scripts/media/.raw/ (git-ignored). The site never loads assets.mixkit.co.
#
# Per clip: a seamless loop (the last FADE seconds crossfade into the first frame), no audio, then
#   <id>-720.mp4  H.264, short side 720, ~1.5 Mbps cap      <id>-720.webm  VP9, short side 720
#   <id>-480.mp4  H.264, short side 480 (phones, small tiles) <id>-480.webm  VP9, short side 480
#   <id>.jpg      poster: the loop's first frame, short side 360
# POSTERS_ONLY=1 rebuilds just the posters.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
raw="$here/.raw"
out="$here/../../apps/web/public/media"
FADE=0.6
mkdir -p "$raw" "$out"

only=" $* "
while IFS=$'\t' read -r id start loop crop _why; do
  [[ -z "$id" || "$id" == \#* ]] && continue
  [[ "$only" != "  " && "$only" != *" $id "* ]] && continue
  src="$raw/$id.mp4"
  [[ -s "$src" ]] || curl -sfL </dev/null -o "$src" "https://assets.mixkit.co/videos/$id/$id-720.mp4"

  read -r w h < <(ffprobe -v error -select_streams v:0 -show_entries stream=width,height -of csv=p=0 "$src" | tr ',' ' ')
  if [[ "$crop" == sq:* ]]; then
    x="${crop#sq:}"
    pre="crop=ih:ih:'max(0,min(iw-ih,iw*$x-ih/2))':0,"
  else
    pre=""
  fi
  # seg = [start, start+loop+FADE]; out = xfade(seg[FADE..], seg[0..FADE]) at loop-FADE → ends on seg(FADE) = its first frame
  len=$(echo "$loop + $FADE" | bc)
  off=$(echo "$loop - $FADE" | bc)
  loopf="[0:v]${pre}fps=24,format=yuv420p,split[a][b];[a]trim=start=$FADE:end=$len,setpts=PTS-STARTPTS[main];[b]trim=0:$FADE,setpts=PTS-STARTPTS[head];[main][head]xfade=transition=fade:duration=$FADE:offset=$off"
  tmp="$raw/$id-loop.mkv"
  ffmpeg -nostdin -v error -y -ss "$start" -t "$len" -i "$src" -filter_complex "$loopf,format=yuv420p" -an -c:v libx264 -crf 12 -preset fast "$tmp"

  [[ -n "${POSTERS_ONLY:-}" ]] || for s in 720 480; do
    if (( w >= h )) || [[ "$crop" == sq:* ]]; then sc="scale=-2:$s"; else sc="scale=$s:-2"; fi
    if [[ $s == 720 ]]; then mr=1300k; vb=800k; crf=27; vcrf=38; else mr=650k; vb=380k; crf=28; vcrf=40; fi
    ffmpeg -nostdin -v error -y -i "$tmp" -vf "$sc" -an -c:v libx264 -profile:v high -preset slow -crf $crf -maxrate $mr -bufsize $mr \
      -pix_fmt yuv420p -movflags +faststart "$out/$id-$s.mp4"
    ffmpeg -nostdin -v error -y -i "$tmp" -vf "$sc" -an -c:v libvpx-vp9 -crf $vcrf -b:v $vb -maxrate $mr -bufsize $mr -row-mt 1 \
      -deadline good -cpu-used 2 -pix_fmt yuv420p "$out/$id-$s.webm"
  done
  # posters stay small: they paint before any video and compete with the page's own first bytes
  if (( w >= h )) || [[ "$crop" == sq:* ]]; then sc="scale=-2:360"; else sc="scale=360:-2"; fi
  ffmpeg -nostdin -v error -y -i "$tmp" -vf "$sc" -frames:v 1 -q:v 7 "$out/$id.jpg"
  rm -f "$tmp"
  printf '%-6s %s\n' "$id" "$(cd "$out" && ls -l "$id"-* "$id".jpg | awk '{printf "%s=%dK ", $9, $5/1024}')"
done < "$here/clips.tsv"
du -sh "$out"
