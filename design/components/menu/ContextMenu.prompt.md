Right-click glass menu (13px) with hover submenus — the home of every secondary command.

```jsx
<ContextMenu items={lensMenu({ ratio: '9:16', takes: 4 })} openSubmenu="aspect ratio" onSelect={(it) => handle(it.value)} />
```

- The Lens menu, in order: **aspect ratio ▸, style ▸ · edit with ai, takes ▸, save as style · export ▸**.
- Aspect ratio: circle (theater), 9:16 (reels), 4:5 (feed), 1:1, 16:9, cinema 1.85, cinema 2.39 — each with a 1.25px outline glyph at its true proportion. Choosing one spring-morphs the Lens (450ms).
- Style ▸ lists **my styles** first, then recipes, then "browse styles" (opens the carousel).
- Labels lowercase; checked items use accent text — nothing else in a menu is coloured.
