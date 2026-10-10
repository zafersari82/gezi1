import { router, useLocalSearchParams } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { launchOrigin, launchParams, launchQr } from "@/features/miniapps/launch-params";
import { MiniAppHost } from "@/features/miniapps/mini-app-host";
import { useMiniApp } from "@/features/miniapps/queries";
import { Button } from "@/ui/button";
import { ErrorView, LoadingView } from "@/ui/states";

export default function MiniAppScreen() {
  const { id, launch } = useLocalSearchParams<{ id: string; launch?: string }>();
  const insets = useSafeAreaInsets();
  const miniApp = useMiniApp(id);
  const origin = launchOrigin(id, launch);

  if (miniApp.isPending) return <LoadingView />;
  if (miniApp.isError) {
    return (
      <View style={{ flex: 1, paddingBottom: insets.bottom }}>
        <ErrorView error={miniApp.error} onRetry={() => void miniApp.refetch()} />
        <Button
          label={origin?.type === "business" ? "Mağazaya dön" : "Geri dön"}
          variant="ghost"
          onPress={() => {
            router.back();
          }}
        />
      </View>
    );
  }
  return (
    <MiniAppHost
      miniApp={miniApp.data}
      launchParams={launchParams(id, launch)}
      launchQr={launchQr(id, launch)}
      launchOrigin={origin}
    />
  );
}
