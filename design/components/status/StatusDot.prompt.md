Status as a 6px dot and one lowercase word — the only way status is ever shown.

```jsx
<StatusDot status="ready" />
<StatusDot status="working" label="weaving" />
<StatusDot status="attention" label="check audio" showLabel={false} />
```

- Never badges, pills, banners, icons or percentages-in-boxes. Dot, or dot + word.
- `working` uses the accent and pulses softly; it is the one non-selection use of blue, because work in progress is the system's active focus.
- Word examples: ready, rendering, weaving, listening, needs you.
