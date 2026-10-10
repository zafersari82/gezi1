import { businessContextSchema, type Cart } from "@vado/contracts";

import type { MiniAppTransport } from "./host-transport";
/** İşletme platform çağrısının kimliğini kabuk belirler; paket kullanıcı veya tenant seçemez. */
export function createBusinessHostBinding(
  selected: { businessId?: string; appInstanceId?: string; miniAppId: string },
  transport: MiniAppTransport,
) {
  let binding =
    selected.businessId === undefined || selected.appInstanceId === undefined
      ? null
      : { businessId: selected.businessId, appInstanceId: selected.appInstanceId };
  async function confirm() {
    const context = businessContextSchema.parse(
      await transport.request(
        "POST",
        binding === null ? "/v1/shell/resolve-context" : "/v1/shell/business-context",
        binding === null
          ? { miniAppId: selected.miniAppId }
          : { ...binding, miniAppId: selected.miniAppId },
      ),
    );
    binding ??= { businessId: context.businessId, appInstanceId: context.appInstanceId };
    if (
      binding.businessId !== context.businessId ||
      binding.appInstanceId !== context.appInstanceId
    )
      throw new Error("İşletme bağlamı uyuşmuyor.");
    return context;
  }
  function base() {
    if (binding === null) throw new Error("İşletme bağlamı yok.");
    return `/v1/shell/${binding.businessId}/${binding.appInstanceId}`;
  }
  function owned(cart: Cart, customerId: string) {
    if (
      cart.businessId !== binding?.businessId ||
      cart.appInstanceId !== binding.appInstanceId ||
      cart.businessCustomerId !== customerId
    )
      throw new Error("İşletme bağlamı uyuşmuyor.");
    return cart;
  }
  return { confirm, base, owned };
}
