import {
  type BridgeParams,
  type BridgeResults,
  listOf,
  returnRequestSchema,
} from "@vado/contracts";

import { createBusinessHostBinding } from "./business-host-binding";
import type { MiniAppTransport } from "./host-transport";

export type ReturnsHost = {
  [
    Method in Extract<
      keyof BridgeParams,
      `returns.${string}`
    > as Method extends `returns.${infer Name}` ? Name : never
  ]: (params: BridgeParams[Method]) => Promise<BridgeResults[Method]>;
};

/** Müşterinin iade taleplerini yalnızca kabuğun doğruladığı işletmeye ve uygulamaya bağlar. */
export function createReturnsHost(
  selected: { businessId?: string; appInstanceId?: string; miniAppId: string },
  transport: MiniAppTransport,
): ReturnsHost {
  const binding = createBusinessHostBinding(selected, transport);
  function owned(
    value: BridgeResults["returns.create"],
    context: Awaited<ReturnType<typeof binding.confirm>>,
  ) {
    if (
      value.businessId !== context.businessId ||
      value.appInstanceId !== context.appInstanceId ||
      value.businessCustomerId !== context.businessCustomerId
    )
      throw new Error("İade bağlamı uyuşmuyor.");
    return value;
  }
  return {
    async list({ id }) {
      const context = await binding.confirm();
      const response = listOf(returnRequestSchema).parse(
        await transport.request("GET", `${binding.base()}/orders/${id}/returns`),
      );
      if (response.items.some((value) => owned(value, context).orderId !== id))
        throw new Error("İade siparişi uyuşmuyor.");
      return response;
    },
    async create({ id, key, ...body }) {
      const context = await binding.confirm();
      const response = owned(
        returnRequestSchema.parse(
          await transport.request("POST", `${binding.base()}/orders/${id}/returns`, body, key),
        ),
        context,
      );
      if (response.orderId !== id) throw new Error("İade siparişi uyuşmuyor.");
      return response;
    },
    async withdraw({ id, key, ...body }) {
      const context = await binding.confirm();
      const response = owned(
        returnRequestSchema.parse(
          await transport.request("POST", `${binding.base()}/returns/${id}/withdraw`, body, key),
        ),
        context,
      );
      if (response.id !== id) throw new Error("İade kimliği uyuşmuyor.");
      return response;
    },
  };
}
