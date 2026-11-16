Inline export — floats over the bottom of the Lens on hover. Never a dialog.

```jsx
<Lens shape="rect" aspect="9 / 16" scene="sofa" progress={phase === 'rendering' ? p : null}>
  <ExportPill value="9:16" cut={cut} onCut={setCut} phase={phase} progress={p} onExport={start}
    style={{ position: 'absolute', left: '50%', bottom: 16, transform: 'translateX(-50%)' }} />
</Lens>
```

- Ratios in Geist Mono: 9:16 / 4:5 / 16:9. Picking one spring-morphs the Lens.
- Cutdowns 15 / 30 / 60s are optional toggles; eyelore cuts to the strongest moments.
- Progress is a ring tracing the Lens edge, not a bar. When done the pill reads **copied link · download** and the link is on the clipboard.
