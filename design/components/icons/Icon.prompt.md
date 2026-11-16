Line icon on a 20px grid with a 1.5px rounded stroke — use for every glyph in the UI.

```jsx
<Icon name="mic" />
<Icon name="check" size={16} />
```

- Inherits `currentColor`. Never filled, never emoji, never coloured except accent text in a checked menu item.
- 16px inside menus, 20px everywhere else.
- Static HTML: load `assets/icons/icons.js` and write `<i data-icon="mic"></i>`.
