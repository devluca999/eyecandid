import type { CSSProperties, MouseEventHandler, ReactNode } from "react";
import { Icon } from "./Icon";
import type { IconName } from "../icons.generated";

/** Ported from design/components/buttons/PillButton.jsx. Buttons are verbs, one or two words. */
export function PillButton({ variant = "primary", small = false, icon, iconRight, iconOnly = false, disabled, onClick, type = "button", title, children, style, testId }: {
  variant?: "primary" | "secondary" | "quiet"; small?: boolean; icon?: IconName; iconRight?: IconName; iconOnly?: boolean; disabled?: boolean;
  onClick?: MouseEventHandler; type?: "button" | "submit"; title?: string; children?: ReactNode; style?: CSSProperties; testId?: string;
}) {
  const cls = ["el-pill", "el-pill--" + variant, small && "el-pill--sm", iconOnly && "el-pill--icon"].filter(Boolean).join(" ");
  return (
    <button type={type} className={cls} disabled={disabled} onClick={onClick} title={title} aria-label={iconOnly ? title : undefined} style={style} data-testid={testId}>
      {icon && <Icon name={icon} />}
      {!iconOnly && children}
      {iconRight && <Icon name={iconRight} />}
    </button>
  );
}
