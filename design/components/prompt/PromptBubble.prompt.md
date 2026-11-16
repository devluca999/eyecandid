The select-and-talk bubble — appears beside a brushed selection, and only then.

```jsx
<PromptBubble listening={micOn} value={transcript} onMic={toggleMic}
  suggestions={['relight to match', 'remove it', 'golden hour']} onSubmit={(text, mode) => run(text, mode)} />
```

- Anchor 16px from the selection's bounding box, on whichever side has room. Never centred on the screen.
- Talking is the default: hold Space to brush, keep holding to talk. The waveform is live; the transcript types itself with a caret.
- Include changes the selection; exclude protects it. The status word names what was selected ("1 subject").
- After run: shimmer inside the selection → result reveals inside the selection → before/after slider → **keep** / **try again**. Try again adds a take to the TakeStack.
