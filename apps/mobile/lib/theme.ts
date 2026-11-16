import { useColorScheme } from "react-native";
import { colors, type ThemeName } from "@eyelore/ui/tokens";

/** Paper by default; Night follows the system (and theater mode, Phase 2). Tokens come from the design system. */
export function useTheme() {
  const name: ThemeName = useColorScheme() === "dark" ? "night" : "paper";
  return { name, c: colors[name] };
}
