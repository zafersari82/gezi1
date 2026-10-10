import {
  availableIncentivesSchema,
  type BridgeParams,
  type BridgeResults,
  cartSchema,
  loyaltyWalletSchema,
} from "@vado/contracts";

import { createBusinessHostBinding } from "./business-host-binding";
import type { MiniAppTransport } from "./host-transport";
export type IncentivesHost = {
  [
    Method in Extract<
      keyof BridgeParams,
      `incentives.${string}`
    > as Method extends `incentives.${infer Name}` ? Name : never
  ]: (params: BridgeParams[Method]) => Promise<BridgeResults[Method]>;
};
export function createIncentivesHost(
  selected: { businessId?: string; appInstanceId?: string; miniAppId: string },
  transport: MiniAppTransport,
): IncentivesHost {
  const binding = createBusinessHostBinding(selected, transport);
  return {
    async getAvailable() {
      const context = await binding.confirm();
      const response = availableIncentivesSchema.parse(
        await transport.request("GET", `${binding.base()}/incentives`),
      );
      if (response.campaigns.some((rule) => rule.businessId !== context.businessId))
        throw new Error("İşletme bağlamı uyuşmuyor.");
      return response;
    },
    async getLoyalty() {
      await binding.confirm();
      return loyaltyWalletSchema.parse(await transport.request("GET", `${binding.base()}/loyalty`));
    },
    async applyCart({ id, key, ...body }) {
      const context = await binding.confirm();
      try {
        return {
          type: "cart",
          cart: binding.owned(
            cartSchema.parse(
              await transport.request("PUT", `${binding.base()}/carts/${id}/incentives`, body, key),
            ),
            context.businessCustomerId,
          ),
        };
      } catch (error) {
        if (
          typeof error !== "object" ||
          error === null ||
          !("code" in error) ||
          error.code !== "cart_version_conflict" ||
          !("details" in error) ||
          typeof error.details !== "object" ||
          error.details === null ||
          !("cart" in error.details)
        )
          throw error;
        return {
          type: "cart_conflict",
          cart: binding.owned(cartSchema.parse(error.details.cart), context.businessCustomerId),
        };
      }
    },
  };
}
