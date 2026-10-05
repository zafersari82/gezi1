import { CATEGORY_LABELS } from "@vado/contracts";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { CategoryTile } from "@/features/businesses/category-tile";
import { useBusiness } from "@/features/businesses/queries";
import { MiniAppIcon } from "@/features/miniapps/mini-app-icon";
import { ReportSheet } from "@/features/reports/report-sheet";
import { colors, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Tag } from "@/ui/badge";
import { HeaderActions, HeaderButton } from "@/ui/header-button";
import { ListRow } from "@/ui/list-row";
import { SectionTitle } from "@/ui/screen";
import { ErrorView, LoadingView } from "@/ui/states";

export default function BusinessScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const business = useBusiness(id);
  const [reporting, setReporting] = useState(false);

  if (business.isPending) return <LoadingView />;
  if (business.isError) {
    return <ErrorView error={business.error} onRetry={() => void business.refetch()} />;
  }
  const { name, category, city, description, verified, miniApps } = business.data;

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

      <View style={styles.header}>
        <CategoryTile category={category} size={64} />
        <View style={styles.headerText}>
          <AppText variant="heading">{name}</AppText>
          <AppText color="muted">
            {CATEGORY_LABELS[category]}, {city}
          </AppText>
          {verified && <Tag label="Doğrulanmış işletme" tone="positive" />}
        </View>
      </View>
      {description !== "" && <AppText style={styles.description}>{description}</AppText>}

      {miniApps.length > 0 && <SectionTitle>Mini uygulamaları</SectionTitle>}
      {miniApps.map((miniApp) => (
        <ListRow
          key={miniApp.id}
          title={miniApp.name}
          subtitle={miniApp.description}
          subtitleLines={2}
          leading={<MiniAppIcon miniApp={miniApp} />}
          chevron
          onPress={() => {
            router.push({ pathname: "/miniapps/[id]", params: { id: miniApp.id } });
          }}
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
  header: {
    flexDirection: "row",
    gap: space.lg,
    padding: space.lg,
  },
  headerText: {
    flex: 1,
    gap: space.xs,
  },
  description: {
    paddingHorizontal: space.lg,
    paddingBottom: space.lg,
  },
});
