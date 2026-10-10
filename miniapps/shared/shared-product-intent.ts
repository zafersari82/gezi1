import type { Cart, StoreContext, TableSession } from "@vado/contracts";
import { z } from "zod";

/** Dış paylaşımın kimlikleri yalnız bir menü önerisidir; sipariş yetkisi değildir. */
export interface SharedProductIntent {
  branchId: string;
  itemId: string;
}
export type SharedProductLaunch =
  | { type: "none" }
  | { type: "conflict"; message: string }
  | { type: "ready"; intent: SharedProductIntent };

export function sharedProductLaunch(
  params: Record<string, string>,
  context: Pick<StoreContext, "businessId" | "appInstanceId" | "branches">,
  cart: Pick<Cart, "branchId" | "status"> | null,
  table: Pick<TableSession, "branchId"> | null,
): SharedProductLaunch {
  if (params.product_branch === undefined && params.product_item === undefined)
    return { type: "none" };
  const branch = z.uuid().safeParse(params.product_branch);
  const item = z.uuid().safeParse(params.product_item);
  if (
    !branch.success ||
    !item.success ||
    params.businessId !== context.businessId ||
    params.appInstanceId !== context.appInstanceId ||
    !context.branches.some((candidate) => candidate.id === branch.data)
  ) {
    return {
      type: "conflict",
      message: "Paylaşılan ürün bu mağazaya ait değil veya bağlantı geçersiz.",
    };
  }
  // Masa QR'ı veya açık başka şube sepeti sessizce değiştirilemez.
  if (table !== null && table.branchId !== branch.data) {
    return { type: "conflict", message: "Masa oturumun başka şubeye ait; mevcut masanı koruduk." };
  }
  if (cart?.status === "open" && cart.branchId !== branch.data) {
    return {
      type: "conflict",
      message: "Sepetinde başka şubeden ürünler var. Sepetin değiştirilmedi.",
    };
  }
  return { type: "ready", intent: { branchId: branch.data, itemId: item.data } };
}
