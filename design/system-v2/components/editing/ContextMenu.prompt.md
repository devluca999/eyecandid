Right-click menu for any Lens, bead or track — the main place secondary actions live (UI appears only on right-click).

```jsx
<ContextMenu aspect="9:16" openSubmenu="aspect" onSelect={id => …} onAspect={a => …} />
```

- Items: icon + lowercase label + mono shortcut. `AspectGlyph` draws a ratio-true outline; the checked ratio is the one accent use.
