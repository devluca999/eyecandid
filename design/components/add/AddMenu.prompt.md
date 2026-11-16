The '+' that appears between beads on hover — one gesture to add anything.

```jsx
<AddMenu onPick={(id) => …} />
<GradeSwatches scene="sofa" value="warm" onPick={setGrade} onReference={openPicker} />
```

- Five items, always in this order: **voice, b-roll, grade, music, text**. Lowercase labels under 20px icons.
- **voice** records live onto a voice thread under the beads (accent waveform while listening).
- **b-roll** opens BrollSheet. **grade** shows GradeSwatches — the current frame in each look, plus "drop a reference".
- Opens anchored above the '+' with the pop spring; closes on pick or Escape.
