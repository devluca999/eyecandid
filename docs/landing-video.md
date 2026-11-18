# Landing clips: why they are 30 fps

17 Nov 2026. The landing's clips looked jittery. Measured in a real Chrome window on an M1 (real GPU), with
`apps/web/scripts/perf/landing-video.mjs`.

## Cause

When two or more videos are playing and the visitor is not moving the mouse or scrolling, Chrome composites the
whole page at 30 Hz instead of 60 (one video, or any input, brings it back to 60). The clips were 24 fps. On a 30 Hz
cadence a 24 fps clip cannot be shown evenly: every fourth frame stays up twice as long (33, 33, 33, 67 ms), a
stutter six times a second on every tile. With the mouse moving the same clips ran on the usual 33/50 ms film cadence.

Ruled out by switching each off in turn (no change to the numbers): the grain overlay, the CSS grades on the clips,
the blur on the far hero tiles, the parallax loop, and WebM against H.264.

## Fix

`scripts/media/build.sh` now builds every loop at 30 fps, which divides 30, 60 and 120 Hz evenly. The sources are 24
or 25 fps, so each source frame is shown once and the clip runs 1.25× (or 1.2×) faster; no frame is synthesised. A
5 s loop in `clips.tsv` becomes 4 s. `RETIME=interp scripts/media/build.sh` keeps the original tempo with motion
interpolation instead (fast hands and feet can ghost).

| Clip frames held 58 ms or longer (the visible stutter) | 24 fps (before) | 30 fps (after) |
| ------------------------------------------------------ | --------------- | -------------- |
| Desktop 1440×900, idle, 12 clips playing               | 25.4%           | 0%             |
| Desktop, mouse moving                                  | 0.9%            | 0.1%           |
| Desktop, scrolling                                     | 0.3%            | 0%             |
| Phone 390×844 (4× CPU throttle), idle, 4 clips playing | 25.2%           | 0%             |
| Phone, scrolling                                       | 0.6%            | 0.1%           |

Before, at idle, three clip frames in four stayed up for 2 display frames (33 ms) and the fourth for 4 (67 ms); with
the mouse moving they alternated 2 and 3. After, every frame stays up for exactly 2, idle or not. The 30 Hz idle
behaviour was confirmed in a stock Chrome (own profile, no automation flags): 30 fps idle, 60 with the mouse moving.
Total media size is unchanged (26.6 MB → 26.5 MB); the page's own code is unchanged, so LCP and CLS are too.

## Shipped

The clip files were rebuilt with these settings on 17 Nov 2026: all 25 clips, 100 video files, every one 30 fps
(`ffprobe`). Media went from 28.7 MB to 28.3 MB. On that build the idle rows above read 0.1% (desktop) and 0% (phone
viewport). Lighthouse mobile, three runs each, same build with the old and the new files: performance 90 and 90, LCP
3.62 s and 3.62 s, CLS 0 and 0. The clips don't load until the page has, so they don't touch LCP.

## Not fixed, and not measured

- **Loop seam.** Each time a clip loops, Chrome seeks and the first frame is held 50–100 ms instead of 33. The
  loops crossfade into their first frame, so it reads as a soft pause. Longer loops would make it rarer.
- **Real phones and Safari.** The phone numbers are desktop Chrome with a phone viewport and CPU throttling, which
  does not slow video decode or the compositor. iPhone Safari and a mid-range Android are unmeasured.
- Chrome's dropped-frame counter stays near 1% at idle with 12 clips playing, before and after.

## Re-measuring

```
cd apps/web && pnpm build && pnpm exec next start --port 3210
node scripts/perf/landing-video.mjs http://127.0.0.1:3210 base
```

It opens Chrome (not headless: headless has no real GPU, and Playwright's Chromium has no H.264).
