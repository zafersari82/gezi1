import { useQuery } from "@tanstack/react-query";
import { type Category, CATEGORY_LABELS, type DiscoveryPage } from "@vado/contracts";
import { router } from "expo-router";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";

import { api } from "@/api/client";
import { CategoryTile } from "@/features/businesses/category-tile";
import { useDiscoveryLocation } from "@/features/discovery/discovery-location";
import { discoveryItemKey, DiscoveryResultRow } from "@/features/discovery/discovery-result-row";
import { colors, radius, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Icon, IconTile } from "@/ui/icon";
import { ListRow } from "@/ui/list-row";
import { SectionTitle } from "@/ui/screen";

/** Ana sayfa sunucudan sınırlı birer sayfa alır; sıralama ücretli reklam/sıralama değildir. */
const HOME_PAGE_SIZE = 6;
const PRIMARY_CATEGORIES: readonly Category[] = [
  "food",
  "shopping",
  "beauty",
  "transport",
  "education",
  "health",
];

function useDiscoveryPreview(
  kind: "business" | "miniapp",
  provinceId?: string,
  districtId?: string,
  ready = true,
) {
  return useQuery({
    queryKey: ["discovery", "home", kind, provinceId, districtId],
    enabled: ready,
    queryFn: () =>
      api.get<DiscoveryPage>("/v1/discovery/search", {
        kind,
        limit: HOME_PAGE_SIZE,
        ...(kind === "business" ? { provinceId, districtId } : {}),
      }),
  });
}

export default function DiscoverScreen() {
  const { location, isPending: locationPending } = useDiscoveryLocation();
  const businesses = useDiscoveryPreview(
    "business",
    location?.provinceId,
    location?.districtId,
    !locationPending,
  );
  const miniApps = useDiscoveryPreview("miniapp");
  const businessItems = businesses.data?.items ?? [];
  const appItems = miniApps.data?.items ?? [];
  const isRefreshing = businesses.isRefetching || miniApps.isRefetching;
  const showEmpty =
    businesses.isSuccess &&
    miniApps.isSuccess &&
    businessItems.length === 0 &&
    appItems.length === 0;

  return (
    <ScrollView
      style={styles.screen}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={isRefreshing}
          onRefresh={() => {
            void businesses.refetch();
            void miniApps.refetch();
          }}
          tintColor={colors.teal}
        />
      }
    >
      <View style={styles.intro}>
        <AppText variant="heading">VADO'da keşfet</AppText>
        <AppText color="muted" variant="callout">
          Yemek, alışveriş ve hizmetler tek uygulamada.
        </AppText>
      </View>
      <Pressable
        style={styles.location}
        accessibilityRole="button"
        onPress={() => { router.push("/discovery-location"); }}
        accessibilityLabel="Konumu değiştir"
      >
        <Icon name="location-outline" size={18} color="teal" />
        <AppText color="teal" variant="callout">
          {locationPending
            ? "Konum yükleniyor…"
            : location === null
              ? "Konum seç · Yakınındaki işletmeler"
              : `${location.provinceName}${location.districtName ? ` / ${location.districtName}` : ""} · Değiştir`}
        </AppText>
      </Pressable>
      <Pressable
        style={styles.search}
        accessibilityRole="button"
        accessibilityLabel="VADO aramasını aç"
        onPress={() => { router.push("/search"); }}
        testID="open-search"
      >
        <Icon name="search" size={20} color="muted" />
        <AppText color="muted" style={styles.searchText}>
          İşletme, hizmet veya uygulama ara
        </AppText>
        <Icon name="arrow-forward" size={18} color="teal" />
      </Pressable>

      <SectionTitle>Sektörler</SectionTitle>
      <View style={styles.categories}>
        {PRIMARY_CATEGORIES.map((category) => (
          <Pressable
            key={category}
            style={styles.category}
            accessibilityRole="button"
            accessibilityLabel={`${CATEGORY_LABELS[category]} kategorisinde ara`}
            onPress={() => { router.push({ pathname: "/search", params: { category } }); }}
          >
            <CategoryTile category={category} />
            <AppText variant="caption" numberOfLines={2} style={styles.categoryText}>
              {CATEGORY_LABELS[category]}
            </AppText>
          </Pressable>
        ))}
      </View>
      <Pressable
        accessibilityRole="button"
        style={styles.seeAll}
        onPress={() => { router.push("/search"); }}
      >
        <AppText color="teal" variant="caption">
          Tüm sektörleri ve hizmetleri ara
        </AppText>
        <Icon name="arrow-forward" size={16} color="teal" />
      </Pressable>

      <SectionTitle>Hızlı erişim</SectionTitle>
      <ListRow
        title="Anlar"
        subtitle="Kişilerinin paylaşımları"
        leading={<IconTile name="aperture" accent="brick" />}
        chevron
        onPress={() => { router.push("/moments"); }}
        testID="open-moments"
      />
      <ListRow
        title="QR okut"
        subtitle="Kişi, işletme veya mini uygulama aç"
        leading={<IconTile name="scan" accent="teal" />}
        chevron
        onPress={() => { router.push("/scan"); }}
      />

      {businessItems.length > 0 && (
        <>
          <SectionTitle>
            {location === null ? "İşletmeleri keşfet" : "Seçtiğin konumdaki işletmeler"}
          </SectionTitle>
          {businessItems.map((item) => (
            <DiscoveryResultRow key={discoveryItemKey(item)} item={item} />
          ))}
          <Pressable
            style={styles.seeAll}
            accessibilityRole="button"
            onPress={() => { router.push({ pathname: "/search", params: { kind: "business" } }); }}
          >
            <AppText color="teal" variant="caption">
              Tüm işletmeleri ara
            </AppText>
            <Icon name="arrow-forward" size={16} color="teal" />
          </Pressable>
        </>
      )}
      {appItems.length > 0 && (
        <>
          <SectionTitle>Mini uygulamalar · Türkiye geneli</SectionTitle>
          {appItems.map((item) => (
            <DiscoveryResultRow key={discoveryItemKey(item)} item={item} />
          ))}
          <Pressable
            style={styles.seeAll}
            accessibilityRole="button"
            onPress={() => { router.push({ pathname: "/search", params: { kind: "miniapp" } }); }}
          >
            <AppText color="teal" variant="caption">
              Tüm mini uygulamaları ara
            </AppText>
            <Icon name="arrow-forward" size={16} color="teal" />
          </Pressable>
        </>
      )}
      {location !== null && businessItems.length === 0 && businesses.isSuccess && (
        <AppText color="muted" style={styles.info}>
          Bu konumda kayıtlı şube bulunamadı. İl geneline geçerek aramayı genişletebilirsin.
        </AppText>
      )}
      {showEmpty && (
        <AppText color="muted" style={styles.info}>
          Henüz listelenmiş bir işletme veya mini uygulama bulunmuyor.
        </AppText>
      )}
      {(businesses.isPending || miniApps.isPending) && (
        <AppText color="muted" style={styles.info}>
          İşletmeler ve uygulamalar yükleniyor…
        </AppText>
      )}
      {(businesses.isError || miniApps.isError) && (
        <Pressable
          style={styles.retry}
          accessibilityRole="button"
          accessibilityLabel="İçerikleri yeniden yükle"
          onPress={() => {
            void businesses.refetch();
            void miniApps.refetch();
          }}
        >
          <AppText color="muted" variant="caption">
            Bazı içerikler yüklenemedi. Tekrar denemek için dokun.
          </AppText>
        </Pressable>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  intro: { gap: space.xs, paddingHorizontal: space.lg, paddingTop: space.xl },
  location: {
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    minHeight: 44,
  },
  search: {
    margin: space.lg,
    minHeight: 52,
    paddingHorizontal: space.md,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    borderRadius: radius.md,
    backgroundColor: colors.mist,
  },
  searchText: { flex: 1 },
  categories: { flexDirection: "row", flexWrap: "wrap", paddingHorizontal: space.sm },
  category: { width: "33.333%", alignItems: "center", padding: space.md, gap: space.sm },
  categoryText: { textAlign: "center" },
  seeAll: {
    minHeight: 44,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: space.xs,
    paddingHorizontal: space.lg,
  },
  info: { padding: space.lg },
  retry: { padding: space.lg, alignItems: "center", minHeight: 44 },
});
