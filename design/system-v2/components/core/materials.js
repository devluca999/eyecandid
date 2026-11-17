export const glass = (extra = {}) => ({
  background: 'var(--glass-fill)',
  WebkitBackdropFilter: 'var(--glass-blur)',
  backdropFilter: 'var(--glass-blur)',
  border: '1px solid var(--glass-edge)',
  boxShadow: 'var(--shadow-glass)',
  borderRadius: 16,
  color: 'var(--ink)',
  ...extra,
});
export const chromeEdge = {
  position: 'absolute', inset: 0, borderRadius: 'inherit', padding: 1, pointerEvents: 'none',
  background: 'var(--chrome-gradient)',
  WebkitMask: 'linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)',
  WebkitMaskComposite: 'xor', maskComposite: 'exclude',
};
export const type = {
  display: { font: 'var(--type-display)', letterSpacing: '-0.02em' },
  title: { font: 'var(--type-title)', letterSpacing: '-0.01em' },
  heading: { font: 'var(--type-heading)' },
  body: { font: 'var(--type-body)' },
  ui: { font: 'var(--type-ui)' },
  meta: { font: 'var(--type-meta)' },
  mono: { font: 'var(--type-timecode)', fontVariantNumeric: 'tabular-nums' },
};
