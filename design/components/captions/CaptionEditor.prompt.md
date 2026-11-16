Inline caption editing on the footage — no caption panel, ever.

```jsx
<Lens shape="rect" aspect="9 / 16" scene="sofa">
  <CaptionEditor words={['wear','it','to','bed']} now={2} look={look} onLook={setLook} />
</Lens>
```

- Click a word to retype it (Enter to commit). Drag the block to move it. Click the block to show the looks pill.
- Looks: **word pop** (default), **karaoke**, **lower third**, **punch**. Translate swaps the language in place.
- Captions keep the speaker's words exactly — polish how it was said, never what was said. Retyping fixes spelling only.
- 22/26 Bold white with the soft caption shadow; punch is 30px uppercase and sits mid-frame.
