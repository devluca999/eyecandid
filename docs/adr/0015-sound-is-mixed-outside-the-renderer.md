# 0015 · The export's sound is mixed outside Remotion, from a plan in core

**Status:** accepted · 2026-11-17

**Context.** J/L cuts split the picture and the sound at each cut, and every cut needs a 30 ms click-free window. Remotion evaluates `volume` once per video frame (33 ms at 30 fps). A spike showed that a volume function can only step from 0 to 1 at frame edges: it cannot make a 15 ms fade. Exports also need a loudness of -14 LUFS with a -1 dBTP ceiling.

**Decision.**
- `toTimeline` returns a sound plan: `sound` pieces with output time and fades. The pieces are the kept ranges exactly, so no removed audio is ever heard.
- The plan is mixed sample-accurately outside Remotion:
  - **Device:** `mixSound` in `core/loudness.ts`, then one gain from BS.1770 integrated loudness capped by the 4x true peak. The result goes to CutWeb as a WAV.
  - **Worker:** the render job carries the plan as an optional `sound` field. ffmpeg mixes it (`atrim` / `afade` / `concat`), then runs two-pass `loudnorm`, with the clean-up chain's delay measured and undone.
- Remotion renders the picture.
- Without a plan, or when the browser can't decode the clip's sound, the renderers fall back to per-piece `<Audio>` with frame-level fades.

**Consequences.**
- The render contract gains an optional field. Older workers ignore it, because the input schema allows extra keys, and keep the old single-pass path.
- The device holds the decoded clip in memory (48 kHz stereo float, about 23 MB per minute).
- Any future sound feature (music, voice) is added to the plan and both mixers, not to the Remotion compositions.
