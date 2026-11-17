Footage placeholder with rich, photographic-feeling scenes (or a real still via `image`) — use anywhere video would appear; never striped boxes or mannequins.

```jsx
<div style={{position:'relative',width:320,height:180,borderRadius:20,overflow:'hidden'}}>
  <Footage scene="walnut-lamp" playing />
</div>
```

- `scene`: morning-sheets · walnut-lamp · gym-dumbbell · rose-case · creator-portrait
- `image`: real still URL (object-fit cover)
- `grade`: comedy · horror · thriller · action · romance · documentary
- `FOOTAGE_SCENES[scene].glow` is the ambient glow colour the Lens casts onto paper.
