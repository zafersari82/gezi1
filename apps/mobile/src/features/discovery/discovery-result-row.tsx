import { CATEGORY_LABELS, type DiscoveryItem } from "@vado/contracts";
import { router } from "expo-router";

import { CategoryTile } from "@/features/businesses/category-tile";
import { MiniAppIcon } from "@/features/miniapps/mini-app-icon";
import { Icon } from "@/ui/icon";
import { ListRow } from "@/ui/list-row";

/** İki arayüz aynı tür/ID anahtarını ve güvenli mini uygulama açılışını paylaşır. */
export function discoveryItemKey(item: DiscoveryItem): string {
  return item.kind === "business" ? `business-${item.business.id}` : `miniapp-${item.miniApp.id}`;
}

/** Keşfet ve Arama aynı güvenli işletme/mini uygulama açılışını paylaşır. */
export function DiscoveryResultRow({
  item,
  deliveryAddressId,
}: {
  item: DiscoveryItem;
  deliveryAddressId?: string;
}) {
  if (item.kind === "business") {
    const business = item.business;
    return (
      <ListRow
        title={business.name}
        subtitle={
          item.delivery === undefined
            ? `İşletme · ${CATEGORY_LABELS[business.category]} · ${business.city}`
            : `${item.delivery.branchName} · Teslimat ${new Intl.NumberFormat("tr-TR", {
                style: "currency",
                currency: "TRY",
              }).format(
                item.delivery.feeMinor / 100,
              )} · Tahmini ${item.delivery.deliveryMinutes} dk`
        }
        leading={<CategoryTile category={business.category} />}
        trailing={
          business.verified ? <Icon name="checkmark-circle" size={18} color="teal" /> : null
        }
        chevron
        onPress={() => {
          router.push({
            pathname: "/businesses/[id]",
            params: {
              id: business.id,
              ...(item.delivery !== undefined && deliveryAddressId !== undefined
                ? { deliveryBranchId: item.delivery.branchId, deliveryAddressId }
                : {}),
            },
          });
        }}
        testID={`result-business-${business.id}`}
      />
    );
  }
  const miniApp = item.miniApp;
  return (
    <ListRow
      title={miniApp.name}
      subtitle={`Mini uygulama · ${CATEGORY_LABELS[miniApp.category]} · ${miniApp.description}`}
      subtitleLines={2}
      leading={<MiniAppIcon miniApp={miniApp} />}
      trailing={miniApp.verified ? <Icon name="checkmark-circle" size={18} color="teal" /> : null}
      chevron
      onPress={() => {
        router.push({ pathname: "/miniapps/[id]", params: { id: miniApp.id } });
      }}
      testID={`result-miniapp-${miniApp.id}`}
    />
  );
}
