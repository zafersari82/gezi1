import type { QrTarget } from "@vado/contracts";
import { router } from "expo-router";
import { useEffect, useState } from "react";
import { StyleSheet, View } from "react-native";

import { errorMessage } from "@/api/client";
import { rememberLaunch } from "@/features/miniapps/launch-params";
import { QrScanner } from "@/features/qr/qr-scanner";
import { useResolveQr } from "@/features/qr/queries";
import { colors } from "@/theme/tokens";
import { useFeedback } from "@/ui/feedback";

/** Hatalı bir koddan sonra aynı kodun art arda yeniden okunmaması için bekleme süresi. */
const RETRY_DELAY_MS = 2000;

/** Okutulan kodun gösterdiği kaydın ekranını, tarama ekranının yerine açar. */
function openTarget(target: QrTarget): void {
  switch (target.type) {
    case "user":
      router.replace({ pathname: "/user/[id]", params: { id: target.user.id } });
      break;
    case "business":
      router.replace({ pathname: "/businesses/[id]", params: { id: target.business.id } });
      break;
    case "miniapp":
      router.replace({
        pathname: "/miniapps/[id]",
        params: { id: target.miniApp.id, launch: rememberLaunch(target.miniApp.id, target.params) },
      });
      break;
  }
}

export default function ScanScreen() {
  const resolveQr = useResolveQr();
  const { notify } = useFeedback();
  const [coolingDown, setCoolingDown] = useState(false);

  useEffect(() => {
    if (!coolingDown) return;
    const timer = setTimeout(() => {
      setCoolingDown(false);
    }, RETRY_DELAY_MS);
    return () => {
      clearTimeout(timer);
    };
  }, [coolingDown]);

  function handleScan(value: string) {
    if (resolveQr.isPending || coolingDown) return;
    resolveQr.mutate(value, {
      onSuccess: openTarget,
      onError: (error) => {
        notify(errorMessage(error));
        setCoolingDown(true);
      },
    });
  }

  return (
    <View style={styles.screen}>
      <QrScanner onScanned={handleScan} paused={resolveQr.isPending || coolingDown} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.black,
  },
});
