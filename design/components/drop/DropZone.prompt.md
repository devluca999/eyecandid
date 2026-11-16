Window-wide drop target. Mount once per screen.

```jsx
<DropZone onDrop={(file) => { setIncoming(file); }} />
// then render the new clip as:
<Lens shape="rect" aspect="9 / 16" scene="sofa" state="generating" meta={<StatusDot status="working" label="analysing" />} />
```

- While a file is over the window, a dashed 9:16 ghost appears centred on the canvas: "drop to start an edit".
- On drop: a Lens appears at the ghost's position with the shimmer and "analysing", then auto-splits into beads that spring out onto the thread one at a time (80ms stagger).
- Never show an upload modal or a progress bar.
