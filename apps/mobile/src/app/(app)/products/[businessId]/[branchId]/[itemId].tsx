import { useQuery } from "@tanstack/react-query";
import {
  type BusinessDetail,
  businessMiniAppLaunchSchema,
  type PublicShareProduct,
  publicShareProductSchema,
} from "@vado/contracts";
import { Image } from "expo-image";
import { router, useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet } from "react-native";

import { api, errorMessage } from "@/api/client";
import { rememberLaunch } from "@/features/miniapps/launch-params";
import { orderingAppForSharedProduct } from "@/features/sharing/order-from-product";
import { colors, radius, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Button } from "@/ui/button";
import { useFeedback } from "@/ui/feedback";
import { ErrorView, LoadingView } from "@/ui/states";

/** Paylaşımdaki fiyat eski mesajdan değil, seçili şubenin güncel kataloğundan gelir. */
export default function SharedProductScreen() {
  const { businessId, branchId, itemId } = useLocalSearchParams<{
    businessId: string;
    branchId: string;
    itemId: string;
  }>();
  const [opening, setOpening] = useState(false);
  const { notify } = useFeedback();
  const product = useQuery({
    queryKey: ["public-shared-product", businessId, branchId, itemId],
    queryFn: async () =>
      publicShareProductSchema.parse(
        await api.get<PublicShareProduct>(
          `/v1/businesses/${businessId}/branches/${branchId}/share-products/${itemId}`,
        ),
      ),
    staleTime: 0,
    retry: false,
  });
  async function openInStore() {
    if (opening || !businessId || !branchId || !itemId) return;
    setOpening(true);
    try {
      // Kartın önbelleği eski olabilir: ürün ve fiyat sunucudan tekrar doğrulanır.
      const fresh = publicShareProductSchema.parse(
        await api.get<PublicShareProduct>(
          `/v1/businesses/${businessId}/branches/${branchId}/share-products/${itemId}`,
        ),
      );
      if (fresh.id !== itemId || fresh.businessId !== businessId || fresh.branchId !== branchId) {
        throw new Error("Ürün ve şube uyuşmuyor.");
      }
      const business = await api.get<BusinessDetail>(`/v1/businesses/${businessId}`);
      const targetApp = orderingAppForSharedProduct(business, fresh);
      if (targetApp === null) {
        notify("Bu mağazada sohbetten sipariş henüz kullanılamıyor.");
        return;
      }
      // AppInstance kimliği sunucuda çözülür; sohbet mesajından okunmaz.
      const context = businessMiniAppLaunchSchema.parse(
        await api.get<unknown>(`/v1/businesses/${businessId}/miniapps/${targetApp.id}/launch`),
      );
      if (context.businessId !== fresh.businessId) throw new Error("İşletme bağlamı uyuşmuyor.");
      const launch = rememberLaunch(targetApp.id, {
        ...context,
        product_branch: fresh.branchId,
        product_item: fresh.id,
      });
      router.push({ pathname: "/miniapps/[id]", params: { id: targetApp.id, launch } });
    } catch (error) {
      notify(error instanceof Error && !("code" in error) ? error.message : errorMessage(error));
    } finally {
      setOpening(false);
    }
  }
  if (product.isPending) return <LoadingView />;
  if (product.isError)
    return <ErrorView error={product.error} onRetry={() => void product.refetch()} />;
  const item = product.data;
  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {item.imageUrl !== null && (
        <Image source={{ uri: item.imageUrl }} style={styles.image} contentFit="cover" />
      )}
      <AppText variant="heading">{item.name}</AppText>
      <AppText color="muted">{item.branchName}</AppText>
      <AppText variant="subheading">
        {(item.amountMinor / 100).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}
      </AppText>
      {item.description !== "" && <AppText>{item.description}</AppText>}
      <Button
        label="Seçenekleri belirle ve siparişe devam et"
        loading={opening}
        onPress={() => {
          void openInStore();
        }}
        testID="shared-product-open-order"
      />
      <Button
        variant="secondary"
        label="Mağazayı görüntüle"
        onPress={() => {
          router.push({ pathname: "/businesses/[id]", params: { id: item.businessId } });
        }}
      />
      <AppText color="muted" variant="caption">
        Bu işlem ürünü işletmenin yayımlanmış VADO satış uygulamasında açar; otomatik sipariş
        oluşturmaz. Ürün, şube, fiyat ve teslimat koşulları sunucuda yeniden doğrulanır.
      </AppText>
    </ScrollView>
  );
}
const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.surface },
  content: { padding: space.lg, gap: space.md },
  image: { width: "100%", aspectRatio: 1.5, borderRadius: radius.lg },
});
