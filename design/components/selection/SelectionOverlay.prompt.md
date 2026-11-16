Brush selection on the footage — the start of select-and-talk.

```jsx
<Lens shape="rect" aspect="9 / 16" width={360} scene="sofa">
  <SelectionOverlay strokes={strokes} mode="include" width={360} height={640} />
</Lens>
```

- Hold **Space** or drag on the Lens to brush. The cursor becomes a white ring the size of the brush.
- Outside dims to 44% black; the edge glows accent and breathes. Exclude mode inverts the dim.
- Results reveal **inside the selection first** (mask the result layer with `selectionMaskURL`), then the before/after slider appears.
- Pair with PromptBubble anchored 16px from the selection's bounding box.
