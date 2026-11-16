import { ConvexProvider, ConvexReactClient } from "convex/react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Text, View } from "react-native";
import { env } from "@/lib/env";
import { useTheme } from "@/lib/theme";

const client = env.convexUrl ? new ConvexReactClient(env.convexUrl, { unsavedChangesWarning: false }) : null;

export default function Root() {
  const { name, c } = useTheme();
  if (!client)
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: c.canvas }}>
        <Text style={{ color: c["ink-secondary"] }}>backend not configured · set EXPO_PUBLIC_CONVEX_URL</Text>
      </View>
    );
  return (
    <ConvexProvider client={client}>
      <StatusBar style={name === "night" ? "light" : "dark"} />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: c.canvas } }} />
    </ConvexProvider>
  );
}
