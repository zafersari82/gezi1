import {
  businessMiniAppLaunchSchema, CATEGORY_LABELS, studioPaletteById, studioTemplateById,
} from "@vado/contracts";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";

import { api, errorMessage } from "@/api/client";
import { CategoryTile } from "@/features/businesses/category-tile";
import { useBusiness } from "@/features/businesses/queries";
import { MiniAppIcon } from "@/features/miniapps/mini-app-icon";
import { rememberLaunch } from "@/features/miniapps/launch-params";
import { ReportSheet } from "@/features/reports/report-sheet";
import { colors, radius, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Tag } from "@/ui/badge";
import { useFeedback } from "@/ui/feedback";
import { HeaderActions, HeaderButton } from "@/ui/header-button";
import { ListRow } from "@/ui/list-row";
import { SectionTitle } from "@/ui/screen";
import { ErrorView, LoadingView } from "@/ui/states";

export default function BusinessScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const business = useBusiness(id);
  const [reporting, setReporting] = useState(false);
  const [openingApp, setOpeningApp] = useState<string | null>(null);
  const { notify } = useFeedback();
  async function openBusinessApp(miniAppId: string) {
    if (openingApp !== null || !id) return;
    setOpeningApp(miniAppId);
    try {
      // İşletme örneğini sunucu belirler; kabuk bu kapsamı her işlemde doğrular.
      const context = businessMiniAppLaunchSchema.parse(await api.get<unknown>(
        `/v1/businesses/${id}/miniapps/${encodeURIComponent(miniAppId)}/launch`,
      ));
      const launch = rememberLaunch(miniAppId, context, null, {
        type: "business", businessId: context.businessId,
      });
      router.push({ pathname: "/miniapps/[id]", params: { id: miniAppId, launch } });
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setOpeningApp(null);
    }
  }

  if (business.isPending) return <LoadingView />;
  if (business.isError) {
    return <ErrorView error={business.error} onRetry={() => void business.refetch()} />;
  }
  const { name, category, city, description, verified, miniApps, storefront } = business.data;
  const palette = storefront === null ? null : studioPaletteById(storefront.palette);
  const layout = storefront === null ? "classic" : studioTemplateById(storefront.templateId).layout;

  return (
    <ScrollView style={styles.screen}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderActions>
              <HeaderButton
                icon="flag-outline"
                label="Şikayet et"
                onPress={() => {
                  setReporting(true);
                }}
              />
            </HeaderActions>
          ),
        }}
      />

      {storefront?.coverUrl != null && (
        <Image
          source={{ uri: storefront.coverUrl }}
          style={[
            styles.cover,
            layout === "compact" && styles.compactCover,
            layout === "editorial" && styles.editorialCover,
          ]}
          contentFit="cover"
          accessibilityLabel={`${name} kapak fotoğrafı`}
        />
      )}
      <View style={[
        styles.header,
        { backgroundColor: palette?.surface ?? colors.surface },
        layout === "editorial" && styles.editorialHeader,
        layout === "enterprise" && styles.enterpriseHeader,
      ]}>
        {storefront?.logoUrl != null ? (
          <Image
            source={{ uri: storefront.logoUrl }}
            style={styles.logo}
            contentFit="cover"
            accessibilityLabel={`${name} logosu`}
          />
        ) : (
          <CategoryTile category={category} size={64} />
        )}
        <View style={styles.headerText}>
          <AppText variant="heading">{storefront?.title ?? name}</AppText>
          {storefront !== null && storefront.title !== name && (
            <AppText color="muted" variant="caption">{name}</AppText>
          )}
          <AppText color="muted">
            {CATEGORY_LABELS[category]}, {city}
          </AppText>
          {verified && <Tag label="Doğrulanmış işletme" tone="positive" />}
        </View>
      </View>
      {storefront !== null && storefront.tagline !== "" && (
        <AppText style={styles.tagline}>{storefront.tagline}</AppText>
      )}
      {description !== "" && <AppText style={styles.description}>{description}</AppText>}

      {miniApps.length > 0 && <SectionTitle>Mini uygulamaları</SectionTitle>}
      {miniApps.length === 0 && (
        <AppText color="muted" style={styles.description}>
          Bu işletmenin henüz yayında bir mini uygulaması bulunmuyor.
        </AppText>
      )}
      {miniApps.map((miniApp) => (
        <ListRow
          key={miniApp.id}
          title={miniApp.name}
          subtitle={miniApp.description}
          subtitleLines={2}
          leading={<MiniAppIcon miniApp={miniApp} />}
          trailing={openingApp === miniApp.id ? <ActivityIndicator color={colors.teal} /> : null}
          chevron
          onPress={openingApp === null ? () => { void openBusinessApp(miniApp.id); } : undefined}
          testID={`business-miniapp-${miniApp.id}`}
        />
      ))}

      <ReportSheet
        target={reporting ? { type: "business", id } : null}
        onClose={() => {
          setReporting(false);
        }}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.surface,
  },
  cover: {
    width: "100%",
    height: 190,
    backgroundColor: colors.mist,
  },
  compactCover: {
    height: 120,
  },
  editorialCover: {
    height: 260,
  },
  editorialHeader: {
    paddingVertical: space.xl,
  },
  enterpriseHeader: {
    borderBottomWidth: 2,
    borderBottomColor: colors.line,
  },
  logo: {
    width: 64,
    height: 64,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
  header: {
    flexDirection: "row",
    gap: space.lg,
    padding: space.lg,
  },
  headerText: {
    flex: 1,
    gap: space.xs,
  },
  tagline: {
    paddingHorizontal: space.lg,
    paddingTop: space.md,
    paddingBottom: space.sm,
  },
  description: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
  },
});
