The advanced drawer — a glass sheet that rises over the bottom 35% while the Lens stays above it.

```jsx
<TimelineDrawer clips={clips} windows={weave(cues, density)} density={density} onDensity={setDensity}
  onFace={[{ start: 0, end: .07 }, { start: .84, end: 1 }]} captions={captions} playhead={.3} />
```

- Tracks in this exact order, never reordered: **video / b-roll / voice / music / captions**.
- The b-roll track is Weave (see WeaveTrack): faint raw ribbon, lit windows with hover reasons, pinned windows.
- The Weave density dial lives in the drawer header and re-weaves live.
- Hidden by default. Opens with ⌥T or by hovering the bottom edge; Escape closes it.
