Weave: eyelore picks the cut-aways from raw b-roll. You only handle the exceptions.

```jsx
const [density, setDensity] = useState(0.4);
<Dial label="b-roll" value={density} onChange={setDensity} low="sparse" high="fast-paced" />
<WeaveTrack windows={weave(cues, density)} onFace={[{ start: 0, end: .07 }, { start: .82, end: 1 }]} />
```

- The whole raw b-roll sits on the track as a faint, desaturated ribbon. Windows where it plays are **lit** — full colour, white hairline, soft glow.
- Hover a window for its one-line reason: "cut away · you said 'nightstand'". Where the cut stays on the speaker: "stayed on you · the claim".
- **on face** brackets mark the hook and CTA; Weave never covers them.
- Pinned windows carry a small pin chip and survive re-weaves when density changes.
