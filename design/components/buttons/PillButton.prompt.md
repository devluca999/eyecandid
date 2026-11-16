Pill-shaped action button, min 44px tall — use for every committed action.

```jsx
<PillButton variant="primary" icon="check">keep</PillButton>
<PillButton variant="secondary" icon="rotate-ccw">try again</PillButton>
<PillButton variant="quiet">skip</PillButton>
<PillButton variant="secondary" iconOnly icon="ellipsis" title="more" />
```

- `primary`: ink fill. At most one per view — the decision you expect.
- `secondary`: glass. The default for anything floating over footage.
- `quiet`: text only, ink-secondary → ink on hover. Dismissals and escapes.
- Labels are one or two lowercase words: "keep", "try again", "export".
