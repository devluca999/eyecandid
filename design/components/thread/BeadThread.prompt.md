The story at a glance — and the main editing surface under the Lens.

```jsx
<BeadThread beads={beads} selected={sel} onSelect={setSel} onTrim={trim} onAdd={openAddMenu}
  moments={[{ bead: 0, label: 'hook' }, { bead: 3, label: 'reveal' }, { bead: 4, label: 'best line' }]}
  looping={loop} onMoment={(m) => zoomAndLoop(m)} momentsOnly={only} playhead={t} />
```

- Bead width is proportional to duration. Drag the white edge handles to trim. **S** splits the bead under the playhead.
- Words float above each bead; filler words ("um", "like", "you know") are faint and struck through — click to restore.
- AI key moments (**hook, reveal, best line**) are small glowing ticks. Click one to zoom and loop it (tick turns accent).
- "moments only" hides every bead without a moment — a 15s cut in one click.
- Hover between beads for the '+' → AddMenu.
