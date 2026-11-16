import React from 'react';
import { Icon } from '../icons/Icon.jsx';

export function PillButton({ variant = 'primary', icon, iconRight, iconOnly = false, disabled, onClick, type = 'button', title, children, style }) {
  const cls = ['el-pill', 'el-pill--' + variant, iconOnly && 'el-pill--icon'].filter(Boolean).join(' ');
  return (
    <button type={type} className={cls} disabled={disabled} onClick={onClick} title={title} aria-label={iconOnly ? title : undefined} style={style}>
      {icon && <Icon name={icon} />}
      {!iconOnly && children}
      {iconRight && <Icon name={iconRight} />}
    </button>
  );
}
