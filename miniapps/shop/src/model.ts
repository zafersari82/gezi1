import type { Cart, Catalog, StoreContext } from "@vado/contracts";

/** Şube fiyatı genel fiyatı geçersiz kılar. Yoksa ürün siparişe sunulmaz. */
export function effectivePrice(catalog: Catalog, branchId: string, itemId: string) {
  return (
    catalog.prices.find((p) => p.itemId === itemId && p.branchId === branchId) ??
    catalog.prices.find((p) => p.itemId === itemId && p.branchId === null)
  );
}

export function canUseShopFulfilment(context: StoreContext, fulfilment: "pickup" | "delivery") {
  return context.capabilities.includes(`ordering.${fulfilment}@1.0.0`);
}

/** Mevcut sepet başka şubeye/adrese/sipariş türüne sessizce dönüştürülemez. */
export function cartMatchesChoice(
  cart: Pick<Cart, "status" | "branchId" | "fulfilment" | "addressId"> | null,
  choice: { branchId: string; fulfilment: "pickup" | "delivery"; addressId: string | null },
) {
  return (
    cart?.status !== "open" ||
    (cart.branchId === choice.branchId &&
      cart.fulfilment === choice.fulfilment &&
      (choice.fulfilment !== "delivery" || cart.addressId === choice.addressId))
  );
}

export const orderStatus: Readonly<Record<string, string>> = {
  placed: "Sipariş alındı",
  accepted: "Onaylandı",
  preparing: "Hazırlanıyor",
  ready: "Hazır",
  completed: "Tamamlandı",
  rejected: "Reddedildi",
  cancelled: "İptal edildi",
};
