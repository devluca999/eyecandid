import { Pressable, StyleSheet, Text, View, type StyleProp, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import Svg, { Path } from "react-native-svg";
import { layout, radius, type as T, type ThemeName } from "@eyelore/ui/tokens";
import { MARK_PATHS, MARK_VIEWBOX } from "./mark.generated";
import { useTheme } from "./theme";

/** Native primitives built from the same tokens as the web (packages/ui). */

export const tap = () => void Haptics.selectionAsync().catch(() => {});
export const thud = () => void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
export const success = () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
export const warn = () => void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});

/** The brand mark, from the exact vector in brand/ (ink on paper, paper on night). */
export function Mark({ width = 44, theme }: { width?: number; theme?: ThemeName }) {
  const { c } = useTheme(theme);
  const [, , w, h] = MARK_VIEWBOX.split(" ").map(Number) as [number, number, number, number];
  return (
    <Svg width={width} height={(width * h) / w} viewBox={MARK_VIEWBOX} accessibilityRole="image" accessibilityLabel="Eyelore">
      {MARK_PATHS.map((d, i) => (
        <Path key={i} d={d} fill={c.ink} />
      ))}
    </Svg>
  );
}

export function StatusDot({ status, label, theme, testID }: { status: "ready" | "working" | "attention"; label: string; theme?: ThemeName; testID?: string }) {
  const { c } = useTheme(theme);
  const color = status === "ready" ? c["status-ready"] : status === "working" ? c["status-working"] : c["status-attention"];
  return (
    <View testID={testID} style={s.row} accessible accessibilityRole="text" accessibilityLabel={label} accessibilityLiveRegion="polite">
      <View style={{ width: layout.statusDot, height: layout.statusDot, borderRadius: 99, backgroundColor: color }} />
      <Text style={[T.meta, { color: c["ink-secondary"], flexShrink: 1 }]}>
        {label}
      </Text>
    </View>
  );
}

type PillProps = {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  testID?: string;
  /** primary = ink; secondary = hairline outline; quiet = text only */
  kind?: "primary" | "secondary" | "quiet";
  hint?: string;
  theme?: ThemeName;
  style?: StyleProp<ViewStyle>;
};

export function Pill({ label, onPress, disabled, testID, kind = "primary", hint, theme, style }: PillProps) {
  const { c } = useTheme(theme);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      hitSlop={6}
      onPress={() => {
        thud();
        onPress();
      }}
      style={({ pressed }) => [
        s.pill,
        kind === "primary" && { backgroundColor: c.ink },
        kind === "secondary" && { borderWidth: 1, borderColor: c.hairline, backgroundColor: c["glass-fill"] },
        kind === "quiet" && { paddingHorizontal: 12 },
        { opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] },
        style,
      ]}
    >
      <Text style={[T.ui, { color: kind === "primary" ? c["text-on-ink"] : kind === "quiet" ? c["ink-secondary"] : c.ink }]}>{label}</Text>
    </Pressable>
  );
}

/** A choice in a row (aspect ratios). The accent marks the selected one, and only that. */
export function Choice({ label, selected, onPress, testID, hint, theme }: { label: string; selected: boolean; onPress: () => void; testID?: string; hint?: string; theme?: ThemeName }) {
  const { c } = useTheme(theme);
  return (
    <Pressable
      testID={testID}
      accessibilityRole="radio"
      accessibilityLabel={label}
      accessibilityHint={hint}
      accessibilityState={{ selected }}
      hitSlop={4}
      onPress={() => {
        tap();
        onPress();
      }}
      style={[s.choice, { borderColor: selected ? c.accent : c.hairline }]}
    >
      <Text style={[T.menu, { color: selected ? c["accent-text"] : c["ink-secondary"] }]}>{label}</Text>
    </Pressable>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  pill: { minHeight: layout.hitMin, paddingHorizontal: 20, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  choice: { minHeight: layout.hitMin, minWidth: 56, paddingHorizontal: 12, borderRadius: radius.pill, borderWidth: 1, alignItems: "center", justifyContent: "center" },
});
