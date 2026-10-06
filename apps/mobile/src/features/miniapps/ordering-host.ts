import {
  type BridgeParams,
  type BridgeResults,
  businessContextSchema,
  type Cart,
  cartSchema,
  catalogSchema,
  fulfilmentSlotsSchema,
  liveReplaySchema,
  type Order,
  orderSchema,
  orderSummarySchema,
  restaurantContextSchema,
  tableBillSchema,
  tableSessionSchema,
} from "@vado/contracts";
import { z } from "zod";

export interface OrderingTransport {
  request: (
    method: "GET" | "POST" | "PUT",
    path: string,
    body?: unknown,
    key?: string,
  ) => Promise<unknown>;
}
export type OrderingHost = {
  [
    Method in Extract<
      keyof BridgeParams,
      `ordering.${string}`
    > as Method extends `ordering.${infer Name}` ? Name : never
  ]: (params: BridgeParams[Method]) => Promise<BridgeResults[Method]>;
};

/** Bağlam kabuğun açtığı uygulamadan gelir; paket parametreleri bağlam taşımaz. */
export function createOrderingHost(
  selected: { businessId?: string; appInstanceId?: string; miniAppId: string },
  transport: OrderingTransport,
  launchQr: string | null = null,
): OrderingHost {
  let binding: { businessId: string; appInstanceId: string; miniAppId: string } | null =
    selected.businessId === undefined || selected.appInstanceId === undefined
      ? null
      : {
          businessId: selected.businessId,
          appInstanceId: selected.appInstanceId,
          miniAppId: selected.miniAppId,
        };
  const base = () => {
    if (binding === null) throw new Error("Sipariş bağlamı yok.");
    return `/v1/shell/${binding.businessId}/${binding.appInstanceId}`;
  };
  async function confirm() {
    const context = businessContextSchema.parse(
      await transport.request(
        "POST",
        binding === null ? "/v1/shell/resolve-context" : "/v1/shell/business-context",
        binding ?? { miniAppId: selected.miniAppId },
      ),
    );
    binding ??= {
      businessId: context.businessId,
      appInstanceId: context.appInstanceId,
      miniAppId: selected.miniAppId,
    };
    if (
      context.businessId !== binding.businessId ||
      context.appInstanceId !== binding.appInstanceId
    )
      throw new Error("Sipariş bağlamı uyuşmuyor.");
    return context;
  }
  function owned<T extends Cart | Order>(value: T, customerId: string): T {
    if (binding === null) throw new Error("Sipariş bağlamı uyuşmuyor.");
    if (
      value.businessId !== binding.businessId ||
      value.appInstanceId !== binding.appInstanceId ||
      value.businessCustomerId !== customerId
    )
      throw new Error("Sipariş bağlamı uyuşmuyor.");
    return value;
  }
  function changedCart(error: unknown, code: string, customerId: string): Cart {
    if (
      typeof error !== "object" ||
      error === null ||
      !("code" in error) ||
      error.code !== code ||
      !("details" in error) ||
      typeof error.details !== "object" ||
      error.details === null ||
      !("cart" in error.details)
    )
      throw error;
    return owned(cartSchema.parse(error.details.cart), customerId);
  }
  return {
    async getRestaurant() {
      const context = await confirm();
      const value = restaurantContextSchema.parse(
        await transport.request("GET", `${base()}/restaurant`),
      );
      if (value.businessId !== context.businessId || value.appInstanceId !== context.appInstanceId)
        throw new Error("Sipariş bağlamı uyuşmuyor.");
      return value;
    },
    async getSlots({ branchId }) {
      await confirm();
      return fulfilmentSlotsSchema.parse(
        await transport.request("GET", `${base()}/fulfilment-slots?branchId=${branchId}`),
      );
    },
    async joinTable() {
      await confirm();
      if (launchQr === null)
        throw new Error("Masaya katılmak için masanın QR kodunu VADO ile okut.");
      const value = tableSessionSchema.parse(
        await transport.request("POST", `${base()}/table-sessions`, { qr: launchQr }),
      );
      if (value.appInstanceId !== binding?.appInstanceId)
        throw new Error("Sipariş bağlamı uyuşmuyor.");
      return value;
    },
    async getTable({ id }) {
      await confirm();
      const value = tableSessionSchema.parse(
        await transport.request("GET", `${base()}/table-sessions/${id}`),
      );
      if (value.appInstanceId !== binding?.appInstanceId)
        throw new Error("Sipariş bağlamı uyuşmuyor.");
      return value;
    },
    async getBill({ id }) {
      await confirm();
      return tableBillSchema.parse(
        await transport.request("GET", `${base()}/table-sessions/${id}/bill`),
      );
    },
    async requestService({ id, key, kind }) {
      await confirm();
      return z
        .object({
          id: z.uuid(),
          tableSessionId: z.uuid(),
          kind: z.enum(["waiter", "bill"]),
          label: z.string(),
        })
        .parse(
          await transport.request("POST", `${base()}/table-sessions/${id}/requests`, { kind }, key),
        );
    },
    async getEvents({ cursor }) {
      const context = await confirm();
      const value = liveReplaySchema.parse(
        await transport.request("GET", `${base()}/live-events?cursor=${cursor}`),
      );
      if (
        value.items.some(
          (e) => e.businessId !== context.businessId || e.appInstanceId !== context.appInstanceId,
        )
      )
        throw new Error("Sipariş bağlamı uyuşmuyor.");
      return value;
    },
    async listOrders(params) {
      const { businessCustomerId, businessId, appInstanceId } = await confirm();
      const query = new URLSearchParams();
      for (const [key, value] of Object.entries(params)) {
        query.set(key, String(value));
      }
      const value = z
        .object({ items: z.array(orderSummarySchema), nextCursor: z.string().nullable() })
        .parse(await transport.request("GET", `${base()}/orders?${query}`));
      if (
        value.items.some(
          (o) =>
            o.businessId !== businessId ||
            o.appInstanceId !== appInstanceId ||
            o.businessCustomerId !== businessCustomerId,
        )
      )
        throw new Error("Sipariş bağlamı uyuşmuyor.");
      return value;
    },
    async getCatalog({ branchId, includeUnavailable, at }) {
      await confirm();
      const catalog = catalogSchema.parse(
        await transport.request(
          "GET",
          `${base()}/catalog?branchId=${encodeURIComponent(branchId)}${includeUnavailable === undefined ? "" : `&includeUnavailable=${includeUnavailable}`}${at === undefined ? "" : `&at=${encodeURIComponent(at)}`}`,
        ),
      );
      if (
        [...catalog.categories, ...catalog.items, ...catalog.optionGroups].some(
          (item) => item.businessId !== binding?.businessId,
        )
      )
        throw new Error("Sipariş bağlamı uyuşmuyor.");
      return catalog;
    },
    async openCart(params) {
      const { businessCustomerId } = await confirm();
      return owned(
        cartSchema.parse(await transport.request("POST", `${base()}/carts`, params)),
        businessCustomerId,
      );
    },
    async getCart({ id }) {
      const { businessCustomerId } = await confirm();
      return owned(
        cartSchema.parse(await transport.request("GET", `${base()}/carts/${id}`)),
        businessCustomerId,
      );
    },
    async replaceCart({ id, ...body }) {
      const { businessCustomerId } = await confirm();
      try {
        return {
          type: "cart",
          cart: owned(
            cartSchema.parse(await transport.request("PUT", `${base()}/carts/${id}`, body)),
            businessCustomerId,
          ),
        };
      } catch (error) {
        return {
          type: "cart_conflict",
          cart: changedCart(error, "cart_version_conflict", businessCustomerId),
        };
      }
    },
    async resetCart({ id, ...body }) {
      const { businessCustomerId } = await confirm();
      try {
        return {
          type: "cart",
          cart: owned(
            cartSchema.parse(await transport.request("POST", `${base()}/carts/${id}/reset`, body)),
            businessCustomerId,
          ),
        };
      } catch (error) {
        return {
          type: "cart_conflict",
          cart: changedCart(error, "cart_version_conflict", businessCustomerId),
        };
      }
    },
    async checkout({ id, key, ...body }) {
      const { businessCustomerId } = await confirm();
      try {
        return {
          type: "order",
          order: owned(
            orderSchema.parse(
              await transport.request("POST", `${base()}/carts/${id}/checkout`, body, key),
            ),
            businessCustomerId,
          ),
        };
      } catch (error) {
        return {
          type: "cart_changed",
          cart: changedCart(error, "cart_changed", businessCustomerId),
        };
      }
    },
    async getOrder({ id }) {
      const { businessCustomerId } = await confirm();
      return owned(
        orderSchema.parse(await transport.request("GET", `${base()}/orders/${id}`)),
        businessCustomerId,
      );
    },
  };
}
