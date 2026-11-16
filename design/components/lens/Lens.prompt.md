The video window — every piece of footage lives in one: theater circle, editing rectangle, storyboard card.

```jsx
<Lens shape="circle" width={420} scene="sofa" />
<Lens shape="rect" aspect="9 / 16" width={320} scene="bed" state="selected" timecode="00:02.14" />
<Lens shape="card" scene="case" state="generating" />
<Lens shape="rect" aspect="9 / 16" scene="nightstand" progress={0.42} />
```

- `shape`: circle (theater, Night), rect (editing — always the clip's TRUE ratio; morph with the 450ms spring), card (storyboard 9:16).
- Every Lens has the 1px chrome edge and casts a soft wide glow of its scene colour onto the paper (`glow={false}` only for dense grids).
- `state`: rest → hover (lift 4px, 180ms) → selected (accent ring — the only blue) → generating (shimmer).
- When one Lens is selected, pass `receded` to every other Lens on screen.
- No UI on a Lens at rest. Timecode, meta and ExportPill appear on hover only.
