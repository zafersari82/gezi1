import { useQuery } from "@tanstack/react-query";
import type { BusinessDetail, MiniAppDetail } from "@vado/contracts";
import * as Clipboard from "expo-clipboard";
import { useLocalSearchParams } from "expo-router";
import { ScrollView, Share, StyleSheet, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import { api } from "@/api/client";
import {
  parseSharedTarget,
  sharedTargetMessage,
  sharedTargetUrl,
} from "@/features/sharing/shared-target";
import { colors, radius, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";
import { useFeedback } from "@/ui/feedback";
import { EmptyState, ErrorView, LoadingView } from "@/ui/states";

/** İmzalı işlem QR'larından farklı olarak bu QR yalnız herkese açık profil açar. */
export default function ShareTargetScreen() {
  const { kind, id } = useLocalSearchParams<{ kind?: string; id?: string }>();
  const target =
    kind === "business" || kind === "miniapp"
      ? parseSharedTarget(`vado:///${kind === "business" ? "businesses" : "miniapps"}/${id ?? ""}`)
      : null;
  const { notify } = useFeedback();
  const detail = useQuery({
    queryKey: ["public-share-target", target?.kind, target?.id],
    enabled: target !== null,
    queryFn: async () => {
      if (target === null) throw new Error("Bağlantı geçersiz");
      return target.kind === "business"
        ? (await api.get<BusinessDetail>(`/v1/businesses/${target.id}`)).name
        : (await api.get<MiniAppDetail>(`/v1/miniapps/${target.id}`)).name;
    },
  });
  if (target === null)
    return (
      <EmptyState
        icon="link-outline"
        title="Bağlantı geçersiz"
        message="Yalnızca VADO işletmeleri ve mini uygulamaları paylaşılabilir."
      />
    );
  if (detail.isPending) return <LoadingView />;
  if (detail.isError)
    return <ErrorView error={detail.error} onRetry={() => void detail.refetch()} />;
  const url = sharedTargetUrl(target);
  const message = sharedTargetMessage(detail.data, target);
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <AppText variant="heading" align="center">
        {detail.data}
      </AppText>
      <AppText align="center" color="muted">
        Bu kodu okutan kişi VADO içinde{" "}
        {target.kind === "business" ? "işletmenin profilini" : "mini uygulamayı"} açar.
      </AppText>
      <View style={styles.qr} testID="target-qr">
        <QRCode value={url} size={220} color={colors.ink} backgroundColor={colors.white} />
      </View>
      <Button
        label="Paylaş"
        icon="share-social-outline"
        onPress={() => {
          void Share.share({ message }).catch(() => {
            notify("Paylaşım açılamadı.");
          });
        }}
      />
      <Button
        label="Bağlantıyı kopyala"
        variant="secondary"
        icon="copy-outline"
        onPress={() => {
          void Clipboard.setStringAsync(url)
            .then(() => {
              notify("Bağlantı kopyalandı.");
            })
            .catch(() => {
              notify("Bağlantı kopyalanamadı.");
            });
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { alignItems: "center", padding: space.xl, gap: space.lg },
  qr: { padding: space.lg, backgroundColor: colors.white, borderRadius: radius.lg },
});
