import type { Platform, Session } from "@vado/contracts";
import { ScrollView, StyleSheet } from "react-native";

import { errorMessage } from "@/api/client";
import { useRevokeSession, useSessions } from "@/features/auth/queries";
import { formatDateTime } from "@/lib/format";
import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Tag } from "@/ui/badge";
import { Button } from "@/ui/button";
import { useFeedback } from "@/ui/feedback";
import { type IconName, IconTile } from "@/ui/icon";
import { ListRow } from "@/ui/list-row";
import { ErrorView, LoadingView } from "@/ui/states";

const PLATFORM_ICONS: Record<Platform, IconName> = {
  android: "logo-android",
  ios: "logo-apple",
  web: "globe-outline",
};

/** Oturumun en son ne zaman ve hangi IP adresinden görüldüğü. */
function sessionSummary(session: Session): string {
  const seen = `Son görülme: ${formatDateTime(session.lastSeenAt)}`;
  return session.ip === null ? seen : `${seen}\nIP adresi: ${session.ip}`;
}

export default function SessionsScreen() {
  const sessions = useSessions();
  const revoke = useRevokeSession();
  const { confirm, notify } = useFeedback();

  if (sessions.isPending) return <LoadingView />;
  if (sessions.isError) {
    return <ErrorView error={sessions.error} onRetry={() => void sessions.refetch()} />;
  }

  async function close(session: Session) {
    const confirmed = await confirm({
      title: `${session.deviceName} oturumu kapatılsın mı?`,
      message: "O cihazda yeniden giriş yapmak gerekir.",
      confirmLabel: "Oturumu kapat",
      destructive: true,
    });
    if (!confirmed) return;
    revoke.mutate(session.id, {
      onError: (error) => {
        notify(errorMessage(error));
      },
    });
  }

  return (
    <ScrollView style={styles.screen}>
      <AppText color="muted" style={styles.intro}>
        Hesabının açık olduğu cihazlar. Tanımadığın bir cihaz görürsen oturumunu kapat. Son bir gün
        içinde ilk kez giriş yapılan cihazlar “Yeni cihaz” olarak işaretlenir.
      </AppText>
      {sessions.data.map((session) => (
        <ListRow
          key={session.id}
          title={session.deviceName}
          subtitle={sessionSummary(session)}
          subtitleLines={2}
          leading={<IconTile name={PLATFORM_ICONS[session.platform]} accent="plum" />}
          trailing={
            session.current ? (
              <Tag label="Bu cihaz" tone="positive" />
            ) : (
              <Button
                label="Kapat"
                variant="secondary"
                size="small"
                onPress={() => void close(session)}
              />
            )
          }
          footer={session.newDevice ? <Tag label="Yeni cihaz" tone="warning" /> : undefined}
          testID={`session-${session.id}`}
        />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  intro: {
    padding: space.lg,
  },
});
