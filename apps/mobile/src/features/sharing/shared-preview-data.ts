import type { BusinessDetail, MiniAppDetail, PublicShareProduct } from "@vado/contracts";

import type { SharedTarget } from "./shared-target";

/** Yalnız halka açık kart alanları; yönetim bağlamı veya mini uygulama izni içermez. */
export interface SharedPreview {
  target: SharedTarget;
  title: string;
  summary: string;
  imageUrl: string | null;
  verified: boolean;
  caption: string;
}

export function businessSharePreview(
  target: SharedTarget,
  business: BusinessDetail,
): SharedPreview {
  if (target.kind !== "business" || target.id !== business.id) {
    throw new Error("Paylaşım hedefi eşleşmiyor");
  }
  // Vitrin başlığı en az iki harftir; kısa tanıtım boş bırakılabilir.
  const tagline = business.storefront?.tagline ?? "";
  return {
    target,
    title: business.storefront?.title ?? business.name,
    summary: tagline === "" ? business.description : tagline,
    imageUrl: business.storefront?.logoUrl ?? null,
    verified: business.verified,
    caption: `${business.city} · İşletme`,
  };
}

export function productSharePreview(
  target: SharedTarget,
  product: PublicShareProduct,
): SharedPreview {
  if (
    target.kind !== "product" ||
    target.id !== product.id ||
    target.businessId !== product.businessId ||
    target.branchId !== product.branchId
  ) {
    throw new Error("Paylaşım hedefi eşleşmiyor");
  }
  return {
    target,
    title: product.name,
    summary: product.description,
    imageUrl: product.imageUrl,
    verified: false,
    caption: `${product.branchName} · ${(product.amountMinor / 100).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}`,
  };
}

export function miniAppSharePreview(target: SharedTarget, miniApp: MiniAppDetail): SharedPreview {
  if (target.kind !== "miniapp" || target.id !== miniApp.id) {
    throw new Error("Paylaşım hedefi eşleşmiyor");
  }
  return {
    target,
    title: miniApp.name,
    summary: miniApp.description,
    imageUrl: miniApp.iconUrl,
    verified: miniApp.verified,
    caption: "Mini uygulama",
  };
}
