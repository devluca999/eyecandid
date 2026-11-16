B-roll search as a glass sheet over the bottom of the canvas — never a media library panel.

```jsx
<BrollSheet query="the ring on a nightstand at night" onQuery={setQ}
  results={[{ scene: 'nightstand', source: 'library', dur: '0:06' }, { scene: 'bed', source: 'stock', dur: '0:04' }, { scene: 'gym', source: 'generate' }]}
  onInsert={insertAtPlayhead} />
```

- Query in plain language ("the ring on a nightstand at night"). Results loop silently.
- Every result is tagged with its source as a dot + one word: **library**, **stock**, **generate** (pulsing accent dot + shimmer while it renders).
- Drag a result onto the bead thread to insert it there (dataTransfer type `text/eyelore-broll`); click drops it at the playhead.
