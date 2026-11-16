import { Pressable, StyleSheet, Text, View, type ViewStyle } from "react-native";
import * as Haptics from "expo-haptics";
import { layout, radius, type as T } from "@eyelore/ui/tokens";
import { useTheme } from "./theme";

/** Native primitives built from the same tokens as the web (packages/ui). */
export function StatusDot({ status, label }: { status: "ready" | "working" | "attention"; label: string }) {
  const { c } = useTheme();
  const color = status === "ready" ? c["status-ready"] : status === "working" ? c["status-working"] : c["status-attention"];
  return (
    <View style={s.row} accessibilityRole="text" accessibilityLabel={label}>
      <View style={{ width: layout.statusDot, height: layout.statusDot, borderRadius: 99, backgroundColor: color }} />
      <Text style={[T.meta, { color: c["ink-secondary"], fontWeight: "400" }]}>{label}</Text>
    </View>
  );
}

export function Pill({ label, onPress, disabled, testID }: { label: string; onPress: () => void; disabled?: boolean; testID?: string }) {
  const { c } = useTheme();
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={label}
      disabled={disabled}
      onPress={() => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        onPress();
      }}
      style={({ pressed }) => [
        s.pill,
        { backgroundColor: c.ink, opacity: disabled ? 0.4 : 1, transform: [{ scale: pressed ? 0.96 : 1 }] },
      ]}
    >
      <Text style={[T.ui, { color: c["text-on-ink"] }]}>{label}</Text>
    </Pressable>
  );
}

/** Theater Lens (circle) with a progress ring. Chrome edge = 1px mid-chrome border. */
export function LensCircle({ size = 220, progress, children, style }: { size?: number; progress?: number | null; children?: React.ReactNode; style?: ViewStyle }) {
  const { c } = useTheme();
  return (
    <View
      accessibilityRole="image"
      accessibilityLabel={progress == null ? "lens" : `progress ${Math.round(progress * 100)} percent`}
      style={[{ width: size, height: size, borderRadius: size / 2, borderWidth: 1, borderColor: c["chrome-mid"], backgroundColor: c["surface-sunken"], overflow: "hidden", alignItems: "center", justifyContent: "center" }, style]}
    >
      {progress != null && (
        <View style={{ position: "absolute", left: 0, bottom: 0, width: "100%", height: `${Math.round(progress * 100)}%`, backgroundColor: c["accent-glow"] }} />
      )}
      {children}
    </View>
  );
}

const s = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 6 },
  pill: { minHeight: layout.hitMin, paddingHorizontal: 20, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
});
