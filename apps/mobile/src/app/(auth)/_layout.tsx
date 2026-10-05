import { Stack } from "expo-router";

import { stackScreenOptions } from "@/theme/navigation";

export default function AuthLayout() {
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Screen name="welcome" options={{ headerShown: false }} />
      <Stack.Screen name="verify" options={{ title: "" }} />
    </Stack>
  );
}
