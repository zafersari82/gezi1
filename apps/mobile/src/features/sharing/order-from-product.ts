import {
  type BusinessDetail,
  commerceMiniAppIdForCategory,
  type PublicShareProduct,
} from "@vado/contracts";

/** Sohbetteki ürün yalnız işletmenin kategorisine uygun, yayımlanmış VADO satış paketine açılır. */
export function orderingAppForSharedProduct(business: BusinessDetail, product: PublicShareProduct) {
  if (business.id !== product.businessId) throw new Error("Ürün ile işletme eşleşmiyor.");
  const appId = commerceMiniAppIdForCategory(business.category);
  if (appId === null) return null;
  return (
    business.miniApps.find(
      (app) => app.id === appId && app.capabilities.includes("ordering.basic"),
    ) ?? null
  );
}
