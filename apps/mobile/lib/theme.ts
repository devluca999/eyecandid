import { useColorScheme } from "react-native";
import { colors, type ThemeName } from "@eyelore/ui/tokens";

/** Paper by default; Night follows the system, and is forced in the theater (review). Tokens come from the design system. */
export function useTheme(force?: ThemeName) {
  const system: ThemeName = useColorScheme() === "dark" ? "night" : "paper";
  const name = force ?? system;
  return { name, c: colors[name] };
}
export type Palette = ReturnType<typeof useTheme>["c"];
