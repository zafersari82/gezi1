import {
  type BridgeParams,
  type BridgeResults,
  favoriteSchema,
  pageOf,
  reviewSchema,
} from "@vado/contracts";

import { createBusinessHostBinding } from "./business-host-binding";
import type { MiniAppTransport } from "./host-transport";

export type FeedbackHost = {
  [
    Method in Extract<
      keyof BridgeParams,
      `feedback.${string}`
    > as Method extends `feedback.${infer Name}` ? Name : never
  ]: (params: BridgeParams[Method]) => Promise<BridgeResults[Method]>;
};

/** Değerlendirme ve favori işlemlerinde işletme kimliğini yalnızca kabuk belirler. */
export function createFeedbackHost(
  selected: { businessId?: string; appInstanceId?: string; miniAppId: string },
  transport: MiniAppTransport,
): FeedbackHost {
  const binding = createBusinessHostBinding(selected, transport);
  function sameBusiness(items: { businessId: string }[], businessId: string) {
    if (items.some((item) => item.businessId !== businessId))
      throw new Error("İşletme bağlamı uyuşmuyor.");
  }
  return {
    async listReviews({ cursor, limit }) {
      const { businessId } = await binding.confirm();
      const query = new URLSearchParams({ limit: String(limit) });
      if (cursor !== undefined) query.set("cursor", cursor);
      const result = pageOf(reviewSchema).parse(
        await transport.request("GET", `${binding.base()}/reviews?${query}`),
      );
      // Yayımlanmış değerlendirmeler başka müşterilere açık; işletme sınırı değişmez.
      sameBusiness(result.items, businessId);
      return result;
    },
    async createReview({ id, key, ...body }) {
      const { businessId, businessCustomerId } = await binding.confirm();
      const result = reviewSchema.parse(
        await transport.request("POST", `${binding.base()}/orders/${id}/review`, body, key),
      );
      if (
        result.businessId !== businessId ||
        result.businessCustomerId !== businessCustomerId ||
        result.orderId !== id
      )
        throw new Error("Değerlendirme bağlamı uyuşmuyor.");
      return result;
    },
    async editReview({ id, key, ...body }) {
      const { businessId, businessCustomerId } = await binding.confirm();
      const result = reviewSchema.parse(
        await transport.request("PUT", `${binding.base()}/reviews/${id}`, body, key),
      );
      if (
        result.businessId !== businessId ||
        result.businessCustomerId !== businessCustomerId ||
        result.id !== id
      )
        throw new Error("Değerlendirme bağlamı uyuşmuyor.");
      return result;
    },
    async listFavorites({ cursor, limit }) {
      const { businessId } = await binding.confirm();
      const query = new URLSearchParams({ limit: String(limit) });
      if (cursor !== undefined) query.set("cursor", cursor);
      const result = pageOf(favoriteSchema).parse(
        await transport.request("GET", `${binding.base()}/favorites?${query}`),
      );
      sameBusiness(result.items, businessId);
      return result;
    },
    async saveFavorite({ key, ...body }) {
      const { businessId } = await binding.confirm();
      const result = favoriteSchema.parse(
        await transport.request("PUT", `${binding.base()}/favorites`, body, key),
      );
      if (result.businessId !== businessId || result.itemId !== body.itemId)
        throw new Error("Favori bağlamı uyuşmuyor.");
      return result;
    },
  };
}
