import type { Cart } from "@vado/contracts";

/**
 * Teslimat sepetinde ürün tutarı (teslimat ücreti hariç) şubenin alt sınırına ulaşmadıysa alt
 * sınırı döndürür; ulaştıysa ya da sepet teslimat sepeti değilse `null`. Son karar sunucudadır.
 */
export function unmetDeliveryMinimum(
  cart: Pick<Cart, "fulfilment" | "delivery" | "totalMinor"> | null,
): number | null {
  if (cart?.fulfilment !== "delivery" || cart.delivery === null || cart.delivery === undefined)
    return null;
  const itemsMinor = cart.totalMinor - cart.delivery.feeMinor;
  return itemsMinor < cart.delivery.minimumMinor ? cart.delivery.minimumMinor : null;
}
