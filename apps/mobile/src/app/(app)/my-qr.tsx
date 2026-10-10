import * as Clipboard from "expo-clipboard";
import { useEffect } from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import QRCode from "react-native-qrcode-svg";

import { usePersonalQr } from "@/features/qr/queries";
import { useMe } from "@/features/session/session-provider";
import { formatCountdown } from "@/lib/format";
import { useNow } from "@/lib/use-now";
import { colors, radius, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Avatar } from "@/ui/avatar";
import { Button } from "@/ui/button";
import { useFeedback } from "@/ui/feedback";
import { Lattice } from "@/ui/lattice";
import { ErrorView, LoadingView } from "@/ui/states";

const QR_SIZE = 216;
const CARD_WIDTH = 320;
const CARD_HEIGHT = 460;

export default function MyQrScreen() {
  const me = useMe();
  const qr = usePersonalQr();
  const { notify } = useFeedback();
  const now = useNow(1000);
  const { refetch } = qr;

  const expiresAt = qr.data?.expiresAt ?? null;
  const secondsLeft = expiresAt === null ? null : (new Date(expiresAt).getTime() - now) / 1000;
  const expired = secondsLeft !== null && secondsLeft <= 0;

  // Kodun süresi dolduğunda yenisi kendiliğinden üretilir.
  useEffect(() => {
    if (expired) void refetch();
  }, [expired, refetch]);

  if (qr.isPending) return <LoadingView />;
  if (qr.isError) return <ErrorView error={qr.error} onRetry={() => void refetch()} />;

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.card}>
        <Lattice
          width={CARD_WIDTH}
          height={CARD_HEIGHT}
          cell={40}
          color={colors.white}
          opacity={0.16}
        />
        <View style={styles.identity}>
          <Avatar name={me.displayName ?? ""} imageUrl={me.avatarUrl} size={48} />
          <View style={styles.identityText}>
            <AppText variant="subheading" color="white" numberOfLines={1}>
              {me.displayName}
            </AppText>
            {me.username !== null && (
              <AppText variant="callout" color="white" style={styles.username} numberOfLines={1}>
                @{me.username}
              </AppText>
            )}
          </View>
        </View>
        <View style={styles.code} testID="personal-qr">
          <QRCode
            value={qr.data.value}
            size={QR_SIZE}
            color={colors.ink}
            backgroundColor={colors.white}
          />
        </View>
        <AppText variant="callout" color="white" align="center">
          Kişilerine eklenmek için bu kodu okut.
        </AppText>
      </View>

      {secondsLeft !== null && (
        <AppText variant="caption" color="muted" align="center">
          Güvenliğin için kod {formatCountdown(secondsLeft)} sonra yenilenir.
        </AppText>
      )}
      <Button
        label="Kodu kopyala"
        variant="secondary"
        icon="copy-outline"
        onPress={() => {
          void Clipboard.setStringAsync(qr.data.value).then(() => {
            notify("Kod panoya kopyalandı.");
          });
        }}
        testID="copy-qr"
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.mist,
  },
  content: {
    alignItems: "center",
    gap: space.lg,
    padding: space.xl,
  },
  card: {
    width: CARD_WIDTH,
    maxWidth: "100%",
    minHeight: CARD_HEIGHT,
    alignItems: "center",
    justifyContent: "space-between",
    gap: space.xl,
    padding: space.xl,
    borderRadius: radius.xl,
    overflow: "hidden",
    backgroundColor: colors.teal,
  },
  identity: {
    flexDirection: "row",
    alignItems: "center",
    alignSelf: "stretch",
    gap: space.md,
  },
  identityText: {
    flex: 1,
  },
  username: {
    opacity: 0.8,
  },
  code: {
    padding: space.lg,
    borderRadius: radius.lg,
    backgroundColor: colors.white,
  },
});
