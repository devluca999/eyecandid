The Lens — Eyecandid's one video window; use it for every piece of footage on screen (theater, editing, storyboard, thumbnails).

```jsx
<Lens shape="edit" aspect="9:16" width={280} scene="walnut-lamp" state="selected" timecode="00:14.32" caption="the only ring I wear" />
<Lens shape="circle" width={360} scene="creator-portrait" playing />
<Lens shape="card" width={160} state="generating" />
```

- `shape` morphs with a spring: circle ↔ edit (true aspect, radius 20) ↔ card (9:16).
- `state`: rest · hover (lift 4px) · selected (the only place accent appears) · generating (blur + slow shimmer).
- `progress` draws the export ring on the edge. Chrome hairline + ambient glow are built in — don't add borders.
