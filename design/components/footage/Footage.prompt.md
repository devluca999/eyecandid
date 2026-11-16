The picture inside every video surface — a photographic stand-in scene, or a real still via `image`.

```jsx
<Lens shape="rect" aspect="9 / 16" scene="bed" />          // Lens renders Footage for you
<Footage scene="nightstand" grade="golden" />                // inside any positioned box
<Footage scene="sofa" image="/stills/creator-01.jpg" />      // real still, keeps the sofa glow
```

- Scenes: **bed** (ring on white sheets, morning light), **nightstand** (walnut, warm lamp at night), **gym** (ring beside a blue dumbbell), **case** (rose velvet case on sunlit oak), **sofa** (creator selfie, string lights), **booth** (office booth, for Sets), **void** (generated white set).
- Never use stripes, grey boxes or labelled placeholders for footage. Pick the scene that matches the beat.
- `grade` previews looks without touching the scene: warm, golden, film, clean, moody, cool, punch, mono.
- Static HTML: `<div class="el-scene el-scene--live" data-scene="bed"><b></b><i></i></div>`.
