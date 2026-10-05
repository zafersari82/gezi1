import { QueryClientProvider } from "@tanstack/react-query";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { queryClient, watchAppFocus } from "@/api/query-client";
import { SessionProvider, useSession } from "@/features/session/session-provider";
import { stackScreenOptions } from "@/theme/navigation";
import { FeedbackProvider } from "@/ui/feedback";

// Kayıtlı oturum okunana kadar açılış görseli ekranda kalır.
void SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <SessionProvider>
          <FeedbackProvider>
            <StatusBar style="dark" />
            <RootNavigator />
          </FeedbackProvider>
        </SessionProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}

/** Oturum durumuna göre yalnızca giriş ekranlarını veya yalnızca uygulamayı açar. */
function RootNavigator() {
  const { state } = useSession();
  const ready = state.status !== "loading";
  const signedIn = state.status === "signedIn";

  useEffect(() => {
    if (ready) void SplashScreen.hideAsync();
  }, [ready]);

  useEffect(() => watchAppFocus(), []);

  if (!ready) return null;
  return (
    <Stack screenOptions={stackScreenOptions}>
      <Stack.Protected guard={!signedIn}>
        <Stack.Screen name="(auth)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Protected guard={signedIn}>
        <Stack.Screen name="(app)" options={{ headerShown: false }} />
      </Stack.Protected>
      <Stack.Screen name="legal/[document]" options={{ presentation: "modal" }} />
    </Stack>
  );
}
