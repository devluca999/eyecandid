Mix the best lines of several takes into one cut.

```jsx
<TakeMixer lines={['wear it to bed.', 'no snag, no pinch.', 'it just stays put.', 'link below.']}
  takes={[{ scene: 'sofa', notes: ['clean', 'rushed', 'clean', 'flat'], best: 0 }, …]}
  picks={picks} onPick={(l, t) => …} />
```

- Rows are takes, columns are script lines. Cells hold a one-line note ("clean · 1.8s", "stumbled", "laughed").
- eyelore marks each take's best line with a quiet "best". The current pick has the accent ring.
- The stitched bar below shows which take each line comes from. Changes apply to the Lens live.
- Opens from the context menu → Takes → mix takes. Glass panel, centred over the receded canvas.
