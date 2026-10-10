import {
  businessChatOrderSchema,
  businessChatOrderStatusLabel,
  type BusinessDetail,
  type MiniAppDetail,
  type PublicShareProduct,
} from "@vado/contracts";

import { api } from "@/api/client";

import {
  businessSharePreview,
  miniAppSharePreview,
  productSharePreview,
  type SharedPreview,
} from "./shared-preview-data";
import type { SharedTarget } from "./shared-target";

/** Mesajdaki addan değil, her zaman erişilebilir sunucu kaydından önizleme oluşturur. */
export async function fetchSharedPreview(target: SharedTarget): Promise<SharedPreview> {
  if (target.kind === "order") {
    // Sipariş önizlemesi daima giriş yapmış konuşma müşterisine ait olmalıdır.
    const order = businessChatOrderSchema.parse(
      await api.get<unknown>(`/v1/conversations/${target.conversationId}/orders/${target.id}`),
    );
    if (order.id !== target.id) throw new Error("Sipariş kimliği uyuşmuyor");
    return {
      target,
      title: `Sipariş · ${order.branchName}`,
      summary: `Durum: ${businessChatOrderStatusLabel(order.status)} · ${(order.totalMinor / 100).toLocaleString("tr-TR", { style: "currency", currency: "TRY" })}`,
      imageUrl: null,
      verified: false,
      caption: "Güncel sipariş durumu",
    };
  }
  if (target.kind === "product") {
    const product = await api.get<PublicShareProduct>(
      `/v1/businesses/${target.businessId}/branches/${target.branchId}/share-products/${target.id}`,
    );
    return productSharePreview(target, product);
  }
  if (target.kind === "business") {
    const business = await api.get<BusinessDetail>(`/v1/businesses/${target.id}`);
    return businessSharePreview(target, business);
  }
  const miniApp = await api.get<MiniAppDetail>(`/v1/miniapps/${target.id}`);
  return miniAppSharePreview(target, miniApp);
}
