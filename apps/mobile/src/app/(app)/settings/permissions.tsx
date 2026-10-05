import { CAPABILITY_LABELS, type ConsentCapability } from "@vado/contracts";
import { useIsFocused } from "expo-router";
import { useEffect, useState } from "react";
import { ScrollView, StyleSheet } from "react-native";

import type { ConsentMap } from "@/features/miniapps/consent-records";
import { readConsents, revokeConsent } from "@/features/miniapps/consents";
import { useMiniApps } from "@/features/miniapps/queries";
import { useMe } from "@/features/session/session-provider";
import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";
import { ListRow } from "@/ui/list-row";
import { SectionTitle } from "@/ui/screen";
import { EmptyState } from "@/ui/states";

export default function PermissionsScreen() {
  const me = useMe();
  const miniApps = useMiniApps();
  const focused = useIsFocused();
  const [consents, setConsents] = useState<ConsentMap>({});

  // İzinler mini uygulama ekranında değişebildiği için ekran her öne geldiğinde yeniden okunur.
  useEffect(() => {
    if (focused) void readConsents(me.id).then(setConsents);
  }, [focused, me.id]);

  async function revoke(miniAppId: string, capability: ConsentCapability) {
    await revokeConsent(me.id, miniAppId, capability);
    setConsents(await readConsents(me.id));
  }

  const entries = Object.entries(consents);
  if (entries.length === 0) {
    return (
      <EmptyState
        icon="shield-checkmark-outline"
        title="Verilmiş izin yok"
        message="Bir mini uygulama profilini, kameranı veya konumunu kullanmak istediğinde önce sana sorulur."
      />
    );
  }

  return (
    <ScrollView style={styles.screen}>
      {entries.map(([miniAppId, record]) => {
        const miniApp = miniApps.data?.find((item) => item.id === miniAppId);
        return (
          <SectionGroup
            key={miniAppId}
            title={miniApp?.name ?? miniAppId}
            capabilities={record.granted}
            outdated={miniApp !== undefined && miniApp.consentKey !== record.key}
            onRevoke={(capability) => void revoke(miniAppId, capability)}
          />
        );
      })}
    </ScrollView>
  );
}

interface SectionGroupProps {
  title: string;
  capabilities: ConsentCapability[];
  /** İzinler verildikten sonra mini uygulama değişti; kullanılmadan önce yeniden sorulacak. */
  outdated: boolean;
  onRevoke: (capability: ConsentCapability) => void;
}

function SectionGroup({ title, capabilities, outdated, onRevoke }: SectionGroupProps) {
  return (
    <>
      <SectionTitle>{title}</SectionTitle>
      {outdated && (
        <AppText variant="callout" color="muted" style={styles.note}>
          Bu mini uygulama güncellendi. Aşağıdaki izinler kullanılmadan önce sana yeniden sorulacak.
        </AppText>
      )}
      {capabilities.map((capability) => (
        <ListRow
          key={capability}
          title={CAPABILITY_LABELS[capability]}
          trailing={
            <Button
              label="İzni kaldır"
              variant="secondary"
              size="small"
              onPress={() => {
                onRevoke(capability);
              }}
            />
          }
        />
      ))}
    </>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  note: {
    paddingHorizontal: space.lg,
    paddingBottom: space.sm,
  },
});
