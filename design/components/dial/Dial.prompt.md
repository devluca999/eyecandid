Dials for whole-edit intent. Turning one re-edits live — no apply button.

```jsx
<Dial label="pace" value={pace} onChange={setPace} low="calm" high="snappy" />
<Dial label="b-roll" value={density} onChange={setDensity} low="sparse" high="fast-paced" />
<Dial label="energy" value={energy} onChange={setEnergy} low="soft" high="loud" />
```

- Drag up/down, scroll, or use arrow keys. The cap rotates −135° → +135°; the arc fills in ink, never accent.
- While the edit catches up, show `<StatusDot status="working" label="re-editing" />` beside the dials.
- Three dials maximum, grouped in one floating glass pill to the left of the Lens. Never a settings panel.
