import React, { useState } from 'react';
import { Icon } from './Icon.jsx';

export function Button({ variant = 'primary', size = 'md', icon, iconAfter, disabled = false, children, onClick, type = 'button', style, title }) {
  const [press, setPress] = useState(false);
  const [hover, setHover] = useState(false);
  const h = size === 'lg' ? 52 : 44;
  const iconOnly = !children;
  const base = {
    height: h, minWidth: h, padding: iconOnly ? 0 : size === 'lg' ? '0 24px' : '0 18px',
    display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 8,
    borderRadius: 999, border: 'none', cursor: disabled ? 'default' : 'pointer',
    font: size === 'lg' ? '500 15px/22px var(--font-sans)' : 'var(--type-ui)',
    opacity: disabled ? .4 : 1, whiteSpace: 'nowrap',
    transform: press && !disabled ? 'scale(.96)' : 'none',
    transition: 'transform var(--dur-lift) var(--spring), background var(--dur-quick) var(--ease-out), box-shadow var(--dur-quick)',
    outline: 'none',
  };
  const v = {
    primary: { background: hover && !disabled ? 'color-mix(in srgb, var(--ink) 86%, var(--canvas))' : 'var(--ink)', color: 'var(--canvas)', boxShadow: '0 1px 2px rgba(17,17,17,.14)' },
    secondary: { background: 'var(--glass-fill)', WebkitBackdropFilter: 'var(--glass-blur)', backdropFilter: 'var(--glass-blur)', color: 'var(--ink)', boxShadow: hover && !disabled ? 'inset 0 0 0 1px var(--glass-edge), var(--shadow-glass), 0 4px 12px rgba(17,17,17,.08)' : 'inset 0 0 0 1px var(--glass-edge), var(--shadow-glass)' },
    quiet: { background: hover && !disabled ? 'color-mix(in srgb, var(--ink) 7%, transparent)' : 'transparent', color: 'var(--ink)' },
  }[variant];
  return (
    <button type={type} title={title} aria-label={iconOnly ? title : undefined} disabled={disabled} onClick={onClick}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => { setHover(false); setPress(false); }}
      onMouseDown={() => setPress(true)} onMouseUp={() => setPress(false)}
      onFocus={(e) => { e.currentTarget.style.boxShadow = 'var(--focus-ring)'; }} onBlur={(e) => { e.currentTarget.style.boxShadow = ''; }}
      style={{ ...base, ...v, ...style }}>
      {icon && <Icon name={icon} />}
      {children}
      {iconAfter && <Icon name={iconAfter} />}
    </button>
  );
}
