Structure templates shown as ghost beat rows under the idea prompt.

```jsx
{TEMPLATES.map((t) => <TemplateRow key={t.name} {...t} onPick={() => useTemplate(t)} />)}
```

- Four templates: Problem / Demo / Proof / CTA, Day in the life, Before / after, Unboxing.
- Picking one turns its ghost cards into the first storyboard row; each ghost becomes a drop target.
- No thumbnails or illustrations — the ghost shapes are the preview.
