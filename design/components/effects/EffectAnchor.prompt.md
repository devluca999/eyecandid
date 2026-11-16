Effects that live on words, not on a timeline.

```jsx
<EffectAnchor words={words} now={i} selection={sel} onSelect={setSel}
  anchors={[{ from: 7, to: 8, label: 'timer', effect: 'a giant timer drops and rings' }]}
  suggestions={['a giant timer drops and rings', 'zoom in on me', 'confetti, once']} onAttach={attach} />
```

- Drag across words in the transcript to select them (accent wash). A glass bubble offers effects as chips, or type one.
- The effect pins to the words with a small accent pin chip. If the words move (trim, re-take), the effect moves with them.
- On playback the effect fires on its first word. Remove by clicking the pin.
