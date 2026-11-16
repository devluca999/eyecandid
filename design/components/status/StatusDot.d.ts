/** A 6px status dot with an optional single lowercase word. */
export interface StatusDotProps {
  /** ready = green, working = accent (pulses), attention = amber. */
  status?: 'ready' | 'working' | 'attention';
  /** One lowercase word. Defaults: "ready", "rendering", "needs you". */
  label?: string;
  showLabel?: boolean;
  style?: React.CSSProperties;
}
export declare function StatusDot(props: StatusDotProps): JSX.Element;
