import {
  businessMiniAppLaunchSchema,
  CATEGORY_LABELS,
  commerceMiniAppIdForCategory,
  idSchema,
  studioPaletteById,
  studioTemplateById,
} from "@vado/contracts";
import { Image } from "expo-image";
import { router, Stack, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ActivityIndicator, ScrollView, StyleSheet, View } from "react-native";

import { api, errorMessage } from "@/api/client";
import { CategoryTile } from "@/features/businesses/category-tile";
import {
  useChannelFollow,
  useChannelPosts,
  useToggleChannelFollow,
} from "@/features/businesses/channels";
import { useBusiness } from "@/features/businesses/queries";
import { prepareDeliveryStoreLaunch } from "@/features/discovery/delivery-order-launch";
import { rememberLaunch } from "@/features/miniapps/launch-params";
import { MiniAppIcon } from "@/features/miniapps/mini-app-icon";
import { ReportSheet } from "@/features/reports/report-sheet";
import { colors, radius, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Tag } from "@/ui/badge";
import { Button } from "@/ui/button";
import { useFeedback } from "@/ui/feedback";
import { HeaderActions, HeaderButton } from "@/ui/header-button";
import { ListRow } from "@/ui/list-row";
import { SectionTitle } from "@/ui/screen";
import { ErrorView, LoadingView } from "@/ui/states";

export default function BusinessScreen() {
  const { id, deliveryBranchId, deliveryAddressId } = useLocalSearchParams<{
    id: string;
    deliveryBranchId?: string;
    deliveryAddressId?: string;
  }>();
  const deliveryBranch = idSchema.safeParse(deliveryBranchId);
  const deliveryAddress = idSchema.safeParse(deliveryAddressId);
  const hasDeliverySelection = deliveryBranch.success && deliveryAddress.success;
  const business = useBusiness(id);
  const channelFollow = useChannelFollow(id);
  const channelPosts = useChannelPosts(id);
  const toggleFollow = useToggleChannelFollow(id);
  const [reporting, setReporting] = useState(false);
  const [openingChat, setOpeningChat] = useState(false);
  const [openingApp, setOpeningApp] = useState<string | null>(null);
  // Açılamayan mini uygulamanın nedeni satırın altında kalır; kısa bildirim gibi kaybolmaz.
  const [appError, setAppError] = useState<{ miniAppId: string; message: string } | null>(null);
  const { notify } = useFeedback();
  async function openBusinessApp(miniAppId: string) {
    if (openingApp !== null || !id) return;
    setOpeningApp(miniAppId);
    setAppError(null);
    try {
      // İşletme örneğini sunucu belirler; kabuk bu kapsamı her işlemde doğrular.
      const context = businessMiniAppLaunchSchema.parse(
        await api.get<unknown>(
          `/v1/businesses/${id}/miniapps/${encodeURIComponent(miniAppId)}/launch`,
        ),
      );
      const launch = rememberLaunch(miniAppId, context, null, {
        type: "business",
        businessId: context.businessId,
      });
      router.push({ pathname: "/miniapps/[id]", params: { id: miniAppId, launch } });
    } catch (error) {
      setAppError({ miniAppId, message: errorMessage(error) });
    } finally {
      setOpeningApp(null);
    }
  }

  async function openDeliveryStore() {
    if (!id || !deliveryBranch.success || !deliveryAddress.success || openingApp !== null) return;
    const appId = commerceMiniAppIdForCategory(business.data?.category ?? "other");
    if (appId === null) return;
    setOpeningApp(appId);
    try {
      const { launch } = await prepareDeliveryStoreLaunch(
        id,
        deliveryBranch.data,
        deliveryAddress.data,
        appId,
      );
      router.push({ pathname: "/miniapps/[id]", params: { id: appId, launch } });
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setOpeningApp(null);
    }
  }

  async function openBusinessChat() {
    if (!id || openingChat) return;
    setOpeningChat(true);
    try {
      const result = await api.post<{ conversationId: string }>(`/v1/businesses/${id}/chat`, {});
      router.push({ pathname: "/chat/[id]", params: { id: result.conversationId } });
    } catch (error) {
      notify(errorMessage(error));
    } finally {
      setOpeningChat(false);
    }
  }

  if (business.isPending) return <LoadingView />;
  if (business.isError) {
    return <ErrorView error={business.error} onRetry={() => void business.refetch()} />;
  }
  const { name, category, city, description, verified, miniApps, storefront } = business.data;
  const orderingAppId = commerceMiniAppIdForCategory(category);
  const deliveryAppReady = miniApps.some(
    (app) =>
      app.id === orderingAppId &&
      app.capabilities.includes("ordering.basic") &&
      app.capabilities.includes("location.addresses"),
  );
  const palette = storefront === null ? null : studioPaletteById(storefront.palette);
  const layout = storefront === null ? "classic" : studioTemplateById(storefront.templateId).layout;
  const coverUrl = storefront?.coverUrl ?? null;
  const logoUrl = storefront?.logoUrl ?? null;

  return (
    <ScrollView style={styles.screen}>
      <Stack.Screen
        options={{
          headerRight: () => (
            <HeaderActions>
              <HeaderButton
                icon="qr-code-outline"
                label="Mağaza QR kodu ve paylaşım"
                onPress={() => {
                  if (id)
                    router.push({ pathname: "/share-target", params: { kind: "business", id } });
                }}
              />
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

      {coverUrl !== null && (
        <Image
          source={{ uri: coverUrl }}
          style={[
            styles.cover,
            layout === "compact" && styles.compactCover,
            layout === "editorial" && styles.editorialCover,
          ]}
          contentFit="cover"
          accessibilityLabel={`${name} kapak fotoğrafı`}
        />
      )}
      <View
        style={[
          styles.header,
          { backgroundColor: palette?.surface ?? colors.surface },
          layout === "editorial" && styles.editorialHeader,
          layout === "enterprise" && styles.enterpriseHeader,
        ]}
      >
        {logoUrl !== null ? (
          <Image
            source={{ uri: logoUrl }}
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
            <AppText color="muted" variant="caption">
              {name}
            </AppText>
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

      {(category === "beauty" || category === "education") && (
        <View style={styles.channelFollow}>
          <Button
            label="Randevu al / Müsait saatlere bak"
            variant="secondary"
            onPress={() => {
              router.push({ pathname: "/bookings/[businessId]", params: { businessId: id } });
            }}
            testID="business-booking-open"
          />
        </View>
      )}
      <View style={styles.channelFollow}>
        <Button
          label="İşletmeye mesaj gönder"
          loading={openingChat}
          onPress={() => void openBusinessChat()}
          testID="business-chat-open"
        />
        <Button
          label={channelFollow.data?.following ? "Takipten çık" : "İşletmeyi takip et"}
          variant="secondary"
          loading={toggleFollow.isPending}
          disabled={channelFollow.isPending || channelFollow.isError}
          onPress={() => {
            void toggleFollow
              .mutateAsync(!channelFollow.data?.following)
              .catch((error: unknown) => {
                notify(errorMessage(error));
              });
          }}
          testID="business-channel-follow"
        />
        <AppText color="muted" variant="caption">
          İşletmenin duyurularını VADO'da gör. Reklam mesajı gönderilmez.
        </AppText>
      </View>
      {(channelPosts.data?.items.length ?? 0) > 0 && (
        <SectionTitle>İşletmeden duyurular</SectionTitle>
      )}
      {channelPosts.data?.items.map((post) => (
        <View key={post.id} style={styles.channelPost}>
          <AppText>{post.body}</AppText>
          <AppText color="muted" variant="caption">
            {new Date(post.publishedAt).toLocaleDateString("tr-TR")}
          </AppText>
        </View>
      ))}
      {hasDeliverySelection && (
        <View style={styles.channelFollow}>
          <AppText variant="bodyStrong">Seçtiğin adrese teslimat</AppText>
          <AppText color="muted" variant="caption">
            Keşifte eşleşen şube ve adres, açılışta sunucudan yeniden kontrol edilir. Ürün, güncel
            ücret ve sipariş koşulları sonraki adımda doğrulanır.
          </AppText>
          <Button
            label="Bu şubeden teslimatla sipariş ver"
            loading={openingApp === orderingAppId}
            disabled={openingApp !== null || !deliveryAppReady}
            onPress={() => void openDeliveryStore()}
            testID="business-delivery-open"
          />
          {!deliveryAppReady && (
            <AppText color="muted" variant="caption">
              Bu işletmenin gerekli adres iznine sahip satış mini uygulaması henüz yayımlanmamış.
            </AppText>
          )}
        </View>
      )}
      {miniApps.length > 0 && <SectionTitle>Mini uygulamaları</SectionTitle>}
      {miniApps.length === 0 && (
        <AppText color="muted" style={styles.description}>
          Bu işletmenin henüz yayında bir mini uygulaması bulunmuyor.
        </AppText>
      )}
      {miniApps.map((miniApp) => (
        <View key={miniApp.id}>
          <ListRow
            title={miniApp.name}
            subtitle={miniApp.description}
            subtitleLines={2}
            leading={<MiniAppIcon miniApp={miniApp} />}
            trailing={openingApp === miniApp.id ? <ActivityIndicator color={colors.teal} /> : null}
            chevron
            onPress={
              openingApp === null
                ? () => {
                    void openBusinessApp(miniApp.id);
                  }
                : undefined
            }
            testID={`business-miniapp-${miniApp.id}`}
          />
          {appError?.miniAppId === miniApp.id && (
            <View style={styles.appError} accessibilityRole="alert">
              <AppText color="coral">Mini uygulama açılamadı: {appError.message}</AppText>
              <Button
                label="Yeniden dene"
                variant="secondary"
                size="small"
                onPress={() => {
                  void openBusinessApp(miniApp.id);
                }}
              />
            </View>
          )}
        </View>
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
  appError: {
    gap: space.sm,
    marginHorizontal: space.lg,
    marginBottom: space.md,
    padding: space.md,
    borderRadius: radius.md,
    backgroundColor: colors.coralSoft,
  },
  channelFollow: {
    padding: space.lg,
    gap: space.sm,
  },
  channelPost: {
    paddingHorizontal: space.lg,
    paddingVertical: space.md,
    gap: space.xs,
    borderBottomColor: colors.line,
    borderBottomWidth: 1,
  },
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
