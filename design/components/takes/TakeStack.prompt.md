Takes as a physical stack beside the Lens — flick the top card to bring the next one in.

```jsx
<TakeStack index={i} onChange={setI} takes={[{ scene: 'sofa' }, { scene: 'sofa', grade: 'warm' }, { scene: 'sofa', grade: 'golden' }]} />
```

- Up to four cards are visible, fanned at 3° / −2.5° / −8°. The top card tilts in 3D with the drag (rotateY = dx/6).
- Flick > 60px left or right to change take; release springs back otherwise (520ms morph spring).
- Every "try again" adds a card to the top; the counter reads "takes 5 / 5 · new".
- Sits 40px right of the editing Lens, vertically centred. Never a grid of takes.
