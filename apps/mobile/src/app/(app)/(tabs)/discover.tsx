import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { MiniAppIcon } from "@/features/miniapps/mini-app-icon";
import { useMiniApps } from "@/features/miniapps/queries";
import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { IconTile } from "@/ui/icon";
import { ListRow } from "@/ui/list-row";
import { SectionTitle } from "@/ui/screen";

/** Keşfet sekmesinde doğrudan gösterilen mini uygulama sayısı. */
const FEATURED_COUNT = 8;

export default function DiscoverScreen() {
  const miniApps = useMiniApps();
  const featured = (miniApps.data ?? []).slice(0, FEATURED_COUNT);

  return (
    <ScrollView style={styles.screen}>
      <ListRow
        title="Anlar"
        subtitle="Kişilerinin paylaşımları"
        leading={<IconTile name="aperture" accent="brick" />}
        chevron
        onPress={() => {
          router.push("/moments");
        }}
        testID="open-moments"
      />
      <ListRow
        title="QR okut"
        subtitle="Kişi ekle, işletme veya mini uygulama aç"
        leading={<IconTile name="scan" accent="teal" />}
        chevron
        onPress={() => {
          router.push("/scan");
        }}
      />
      <ListRow
        title="Mini uygulamalar"
        subtitle="İndirmeden kullan"
        leading={<IconTile name="apps" accent="cobalt" />}
        chevron
        onPress={() => {
          router.push("/miniapps");
        }}
        testID="open-miniapps"
      />
      <ListRow
        title="İşletmeler"
        subtitle="Doğrulanmış işletme hesapları"
        leading={<IconTile name="storefront" accent="ochre" />}
        chevron
        onPress={() => {
          router.push("/businesses");
        }}
        testID="open-businesses"
      />

      {featured.length > 0 && (
        <>
          <SectionTitle>Mini uygulamalar</SectionTitle>
          <View style={styles.grid}>
            {featured.map((miniApp) => (
              <Pressable
                key={miniApp.id}
                style={styles.app}
                accessibilityRole="button"
                accessibilityLabel={miniApp.name}
                onPress={() => {
                  router.push({ pathname: "/miniapps/[id]", params: { id: miniApp.id } });
                }}
                testID={`featured-${miniApp.id}`}
              >
                <MiniAppIcon miniApp={miniApp} size={56} />
                <AppText variant="caption" align="center" numberOfLines={2}>
                  {miniApp.name}
                </AppText>
              </Pressable>
            ))}
          </View>
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    paddingHorizontal: space.sm,
  },
  app: {
    width: "25%",
    alignItems: "center",
    gap: space.sm,
    padding: space.sm,
  },
});
