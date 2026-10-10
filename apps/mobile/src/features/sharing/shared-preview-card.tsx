import { useQuery } from "@tanstack/react-query";
import { Image } from "expo-image";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";

import { colors, radius, space } from "@/theme/tokens";
import { AppText } from "@/ui/app-text";
import { Icon } from "@/ui/icon";

import { openSharedTarget } from "./open-target";
import { fetchSharedPreview } from "./shared-preview";
import type { SharedTarget } from "./shared-target";

interface SharedPreviewCardProps {
  target: SharedTarget;
  onLongPress?: () => void;
}

/** Yayında olan işletme/mini uygulama kartı: kaydı silinmiş hedefler açılamaz. */
export function SharedPreviewCard({ target, onLongPress }: SharedPreviewCardProps) {
  const preview = useQuery({
    queryKey: [
      "shared-preview",
      target.kind,
      target.id,
      target.kind === "order" ? target.conversationId : "",
    ],
    queryFn: () => fetchSharedPreview(target),
    staleTime: target.kind === "product" || target.kind === "order" ? 0 : 60_000,
    refetchOnMount: target.kind === "product" || target.kind === "order" ? "always" : true,
    refetchInterval: target.kind === "order" ? 30_000 : false,
    retry: false,
    ...(target.kind === "order" ? { gcTime: 0 } : {}),
  });

  if (preview.isPending) {
    return (
      <Pressable onLongPress={onLongPress} style={styles.unavailable}>
        <ActivityIndicator color={colors.teal} />
        <AppText color="muted" variant="caption">
          Paylaşım yükleniyor…
        </AppText>
      </Pressable>
    );
  }
  if (preview.isError) {
    return (
      <Pressable onLongPress={onLongPress} style={styles.unavailable}>
        <Icon name="link-outline" color="muted" />
        <AppText color="muted" variant="caption">
          Bu paylaşım şu anda açılamıyor.
        </AppText>
      </Pressable>
    );
  }
  const item = preview.data;
  return (
    <Pressable
      onPress={() => {
        openSharedTarget(item.target);
      }}
      onLongPress={onLongPress}
      accessibilityRole="link"
      accessibilityLabel={`${item.title}, ${item.caption}. Aç`}
      style={({ pressed }) => [styles.card, pressed && styles.pressed]}
      testID={`shared-preview-${target.kind}-${target.id}`}
    >
      <View style={styles.header}>
        {item.imageUrl !== null ? (
          <Image source={{ uri: item.imageUrl }} style={styles.logo} contentFit="cover" />
        ) : (
          <View style={styles.placeholder}>
            <Icon
              name={
                target.kind === "business"
                  ? "storefront-outline"
                  : target.kind === "product"
                    ? "pricetag-outline"
                    : target.kind === "order"
                      ? "receipt-outline"
                      : "apps-outline"
              }
              color="teal"
            />
          </View>
        )}
        <View style={styles.names}>
          <AppText variant="subheading" numberOfLines={2}>
            {item.title}
          </AppText>
          <AppText variant="caption" color="muted" numberOfLines={1}>
            {item.caption}
          </AppText>
        </View>
        {item.verified && <Icon name="checkmark-circle" color="teal" size={18} />}
      </View>
      {item.summary.trim() !== "" && (
        <AppText variant="caption" color="muted" numberOfLines={2}>
          {item.summary}
        </AppText>
      )}
      <View style={styles.action}>
        <AppText variant="caption" color="teal">
          {target.kind === "business"
            ? "Mağazayı aç"
            : target.kind === "product"
              ? "Ürünü gör"
              : target.kind === "order"
                ? "Siparişi gör"
                : "Mini uygulamayı aç"}
        </AppText>
        <Icon name="arrow-forward" color="teal" size={16} />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    width: "100%",
    padding: space.md,
    gap: space.sm,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pressed: { opacity: 0.8 },
  header: { flexDirection: "row", alignItems: "center", gap: space.sm },
  names: { flex: 1, gap: space.xs },
  logo: { width: 48, height: 48, borderRadius: radius.md, backgroundColor: colors.mist },
  placeholder: {
    width: 48,
    height: 48,
    borderRadius: radius.md,
    backgroundColor: colors.tealSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  action: { flexDirection: "row", alignItems: "center", gap: space.xs, paddingTop: space.xs },
  unavailable: {
    minHeight: 72,
    minWidth: 200,
    flexDirection: "row",
    alignItems: "center",
    gap: space.sm,
    padding: space.md,
    borderRadius: radius.lg,
    backgroundColor: colors.surface,
  },
});
