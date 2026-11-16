The Eyelore lockup — exact SVG mark plus lowercase "eyelore" in Geist Medium.

```jsx
<Lockup height={20} />                 // top bar
<Lockup height={64} theme="night" />   // theater splash
<Lockup height={16} wordmark={false} />
```

- Gap is 0.35× the mark's height; the mark is ~1.1× the wordmark's x-height. The component does the maths.
- Below 48px wide (height < 32) it switches to the small cut automatically. Favicons and app icons always use the small cut.
- Black (#111) on Paper, #F2F0EA on Night. Never colour, outline, stretch or add effects. Clear space = ripple-stack height on every side.
