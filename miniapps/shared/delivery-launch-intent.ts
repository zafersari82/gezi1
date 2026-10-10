import type { Cart, StoreContext, TableSession } from "@vado/contracts";
import { z } from "zod";

export interface DeliveryIntent {
  branchId: string;
  addressId: string;
}
export type DeliveryLaunch =
  | { type: "none" }
  | { type: "conflict"; message: string }
  | { type: "ready"; intent: DeliveryIntent };

/**
 * Trusted launch origin is established by the host, but the mini-app still
 * treats these identifiers as navigation hints. The ordering API independently
 * verifies user/address ownership, service region and active fulfilment policy.
 */
export function deliveryLaunchIntent(
  params: Record<string, string>,
  context: Pick<StoreContext, "businessId" | "appInstanceId"> & {
    branches: readonly Pick<StoreContext["branches"][number], "id">[];
  },
  cart: Pick<Cart, "branchId" | "status" | "fulfilment" | "addressId"> | null,
  table: Pick<TableSession, "branchId"> | null,
): DeliveryLaunch {
  if (params.delivery_branch === undefined && params.delivery_address === undefined) {
    return { type: "none" };
  }
  const branch = z.uuid().safeParse(params.delivery_branch);
  const address = z.uuid().safeParse(params.delivery_address);
  if (
    !branch.success ||
    !address.success ||
    params.businessId !== context.businessId ||
    params.appInstanceId !== context.appInstanceId ||
    !context.branches.some((candidate) => candidate.id === branch.data)
  ) {
    return {
      type: "conflict",
      message: "Teslimat bağlantısı bu mağazaya ait değil veya geçersiz.",
    };
  }
  if (table !== null) {
    return { type: "conflict", message: "Masa oturumun açıkken teslimat sepetine geçilemez." };
  }
  if (
    cart?.status === "open" &&
    (cart.branchId !== branch.data ||
      cart.fulfilment !== "delivery" ||
      cart.addressId !== address.data)
  ) {
    return {
      type: "conflict",
      message: "Mevcut sepetin farklı şube, adres veya sipariş türünde; sepetin değiştirilmedi.",
    };
  }
  return { type: "ready", intent: { branchId: branch.data, addressId: address.data } };
}
