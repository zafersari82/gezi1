import { z } from "zod";

import type { Platform } from "./auth";
import type { LiveReplay } from "./business-live";
import type { Capability } from "./capabilities";
import type { Catalog } from "./catalog";
import { amountMinorSchema, idSchema, pageQuerySchema } from "./common";
import { type DeliveryQuote, deliveryQuoteBodySchema } from "./delivery";
import {
  type Favorite,
  favoriteBodySchema,
  type Review,
  reviewBodySchema,
  reviewEditBodySchema,
} from "./feedback";
import {
  applyCartIncentivesBodySchema,
  type availableIncentivesSchema,
  idempotencyKeySchema,
  type LoyaltyWallet,
} from "./incentives";
import {
  type LocationAddress,
  locationAddressBodySchema,
  locationAddressUpdateBodySchema,
  type LocationCountry,
  locationKeySchema,
  type LocationPath,
  type LocationPlace,
  locationVersionBodySchema,
} from "./location";
import type { MiniAppIdentity, MiniAppIdentityToken } from "./miniapps";
import {
  type Cart,
  checkoutCartBodySchema,
  openCartBodySchema,
  type Order,
  orderStateSchema,
  type OrderSummary,
  replaceCartBodySchema,
  resetCartBodySchema,
} from "./ordering";
import type { ConfigValues } from "./packages";
import { merchantIdSchema, orderIdSchema, paymentDescriptionSchema } from "./payments";
import { tableRequestBodySchema, type TableSession } from "./restaurant";
import {
  reorderBodySchema,
  type ReorderResult,
  type ReturnRequest,
  returnRequestBodySchema,
  returnWithdrawBodySchema,
} from "./returns";
import type { StoreContext } from "./storefront";

/**
 * Mini uygulama ile VADO kabuğu arasındaki köprü protokolü.
 *
 * Mini uygulama bir istek zarfı gönderir, kabuk aynı `id` ile tek bir yanıt döner.
 * Zarfta uygulama kimliği yoktur: kabuk, isteğin hangi mini uygulamadan geldiğini
 * açtığı pencereden bilir; mini uygulama başka bir uygulama gibi davranamaz.
 */
export const BRIDGE_PROTOCOL_VERSION = 1;

/** Her köprü metodunun gerektirdiği yetki. `null` yetki gerektirmez. */
export const BRIDGE_METHODS = {
  "incentives.getAvailable": "incentives.basic",
  "incentives.getLoyalty": "incentives.basic",
  "incentives.applyCart": "incentives.basic",
  "container.getInfo": null,
  "container.close": null,
  "app.getContext": null,
  "identity.getProfile": "identity.basic",
  "identity.getToken": "identity.basic",
  "scanner.scanQr": "camera.qr",
  "location.getCurrent": "location.coarse",
  "location.listCountries": "location.catalog",
  "location.listProvinces": "location.catalog",
  "location.listDistricts": "location.catalog",
  "location.listNeighborhoods": "location.catalog",
  "location.getNeighborhood": "location.catalog",
  "location.listAddresses": "location.addresses",
  "location.getAddress": "location.addresses",
  "location.createAddress": "location.addresses",
  "location.updateAddress": "location.addresses",
  "location.archiveAddress": "location.addresses",

  "payment.request": "payment.request",
  "storage.get": "storage.local",
  "storage.set": "storage.local",
  "storage.remove": "storage.local",
  "share.open": "share.native",
  "ordering.getDeliveryQuote": "location.addresses",
  "ordering.getDeliverySnapshot": "location.addresses",
  "ordering.getCatalog": "ordering.basic",
  "ordering.openCart": "ordering.basic",
  "ordering.getCart": "ordering.basic",
  "ordering.replaceCart": "ordering.basic",
  "ordering.resetCart": "ordering.basic",
  "ordering.checkout": "ordering.basic",
  "ordering.getOrder": "ordering.basic",
  "ordering.getStore": "ordering.basic",
  "ordering.getSlots": "ordering.basic",
  "tableService.join": "table_service.basic",
  "tableService.get": "table_service.basic",
  "tableService.getBill": "table_service.basic",
  "tableService.request": "table_service.basic",
  "ordering.getEvents": "ordering.basic",
  "ordering.listOrders": "ordering.basic",
  "ordering.reorder": "ordering.basic",
  "feedback.listReviews": "ordering.basic",
  "feedback.createReview": "ordering.basic",
  "feedback.editReview": "ordering.basic",
  "feedback.listFavorites": "ordering.basic",
  "feedback.saveFavorite": "ordering.basic",
  "returns.list": "ordering.basic",
  "returns.create": "ordering.basic",
  "returns.withdraw": "ordering.basic",
} as const satisfies Record<string, Capability | null>;

export type BridgeMethod = keyof typeof BRIDGE_METHODS;

export function isBridgeMethod(value: string): value is BridgeMethod {
  return Object.hasOwn(BRIDGE_METHODS, value);
}

export const STORAGE_VALUE_MAX = 50_000;
export const storageKeySchema = z.string().regex(/^[A-Za-z0-9._-]{1,80}$/);

const noParamsSchema = z.unknown().transform(() => undefined);

export const paymentRequestParamsSchema = z.object({
  merchantId: merchantIdSchema,
  orderId: orderIdSchema,
  description: paymentDescriptionSchema,
  amountMinor: amountMinorSchema,
});
export type PaymentRequestParams = z.infer<typeof paymentRequestParamsSchema>;

export const shareParamsSchema = z.object({
  title: z.string().trim().min(1).max(120),
  text: z.string().max(2000).optional(),
  url: z.url().optional(),
});
export type ShareParams = z.infer<typeof shareParamsSchema>;

/** Kabuk, her isteğin parametrelerini bu şemalarla doğrular. */
export const bridgeParamsSchemas = {
  "incentives.getAvailable": noParamsSchema,
  "incentives.getLoyalty": noParamsSchema,
  "incentives.applyCart": applyCartIncentivesBodySchema
    .extend({ id: idSchema, key: idempotencyKeySchema })
    .strict(),
  "container.getInfo": noParamsSchema,
  "container.close": noParamsSchema,
  "app.getContext": noParamsSchema,
  "identity.getProfile": noParamsSchema,
  "identity.getToken": noParamsSchema,
  "scanner.scanQr": noParamsSchema,
  "location.getCurrent": noParamsSchema,
  "location.listCountries": noParamsSchema,
  "location.listProvinces": z.object({ countryId: idSchema }).strict(),
  "location.listDistricts": z.object({ provinceId: idSchema }).strict(),
  "location.listNeighborhoods": z.object({ districtId: idSchema }).strict(),
  "location.getNeighborhood": z.object({ id: idSchema }).strict(),
  "location.listAddresses": noParamsSchema,
  "location.getAddress": z.object({ id: idSchema }).strict(),
  "location.createAddress": locationAddressBodySchema.extend({ key: locationKeySchema }).strict(),
  "location.updateAddress": locationAddressUpdateBodySchema
    .extend({ id: idSchema, key: locationKeySchema })
    .strict(),
  "location.archiveAddress": locationVersionBodySchema
    .extend({ id: idSchema, key: locationKeySchema })
    .strict(),

  "payment.request": paymentRequestParamsSchema,
  "storage.get": z.object({ key: storageKeySchema }),
  "storage.set": z.object({ key: storageKeySchema, value: z.string().max(STORAGE_VALUE_MAX) }),
  "storage.remove": z.object({ key: storageKeySchema }),
  "share.open": shareParamsSchema,
  "ordering.getCatalog": z
    .object({
      branchId: idSchema,
      includeUnavailable: z.boolean().optional(),
      at: z.iso.datetime({ offset: true }).optional(),
    })
    .strict(),
  "ordering.getDeliveryQuote": deliveryQuoteBodySchema,
  "ordering.getDeliverySnapshot": z.object({ id: idSchema }).strict(),
  "ordering.openCart": openCartBodySchema.strict(),
  "ordering.getCart": z.object({ id: idSchema }).strict(),
  "ordering.replaceCart": replaceCartBodySchema.extend({ id: idSchema }).strict(),
  "ordering.resetCart": resetCartBodySchema.extend({ id: idSchema }).strict(),
  "ordering.checkout": checkoutCartBodySchema
    .extend({ id: idSchema, key: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/) })
    .strict(),
  "ordering.getOrder": z.object({ id: idSchema }).strict(),
  "ordering.getStore": noParamsSchema,
  "ordering.getSlots": z.object({ branchId: idSchema }).strict(),
  "tableService.join": noParamsSchema,
  "tableService.get": z.object({ id: idSchema }).strict(),
  "tableService.getBill": z.object({ id: idSchema }).strict(),
  "tableService.request": tableRequestBodySchema
    .extend({ id: idSchema, key: z.string().regex(/^[A-Za-z0-9._:-]{1,128}$/) })
    .strict(),
  "ordering.getEvents": z
    .object({ cursor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER) })
    .strict(),
  "ordering.reorder": reorderBodySchema
    .extend({ id: idSchema, key: idempotencyKeySchema })
    .strict(),
  "feedback.listReviews": pageQuerySchema.strict(),
  "feedback.createReview": reviewBodySchema
    .extend({ id: idSchema, key: idempotencyKeySchema })
    .strict(),
  "feedback.editReview": reviewEditBodySchema
    .extend({ id: idSchema, key: idempotencyKeySchema })
    .strict(),
  "feedback.listFavorites": pageQuerySchema.strict(),
  "feedback.saveFavorite": favoriteBodySchema.extend({ key: idempotencyKeySchema }).strict(),
  "returns.list": z.object({ id: idSchema }).strict(),
  "returns.create": returnRequestBodySchema
    .safeExtend({ id: idSchema, key: idempotencyKeySchema })
    .strict(),
  "returns.withdraw": returnWithdrawBodySchema
    .extend({ id: idSchema, key: idempotencyKeySchema })
    .strict(),
  "ordering.listOrders": z
    .object({
      limit: z.number().int().min(1).max(100).default(30),
      cursor: idSchema.optional(),
      active: z.boolean().optional(),
      status: orderStateSchema.optional(),
    })
    .strict(),
} satisfies Record<BridgeMethod, z.ZodType>;

export type BridgeParams = {
  [M in BridgeMethod]: z.infer<(typeof bridgeParamsSchemas)[M]>;
};

export interface ContainerInfo {
  platform: Platform;
  appVersion: string;
  locale: string;
  protocolVersion: number;
}

/** Mini uygulamanın hangi uygulama kaydı olarak ve hangi ayarlarla açıldığı. */
export interface MiniAppContext {
  /** Uygulama kaydının kimliği. Aynı paketi kullanan her işletmenin kaydı ayrıdır. */
  appId: string;
  version: string;
  /** İşletmeye özel ayarlar; alanları paketin bildirim dosyası tanımlar. */
  config: ConfigValues;
  /**
   * Uygulamayı açan QR kodunun imzalı parametreleri. Uygulama listeden ya da parametresiz bir
   * koddan açıldıysa boştur.
   */
  params: Record<string, string>;
}

export interface BridgeResults {
  "incentives.getAvailable": z.infer<typeof availableIncentivesSchema>;
  "incentives.getLoyalty": LoyaltyWallet;
  "incentives.applyCart": { type: "cart" | "cart_conflict"; cart: Cart };
  "ordering.getDeliveryQuote": DeliveryQuote;
  "ordering.getDeliverySnapshot": DeliveryQuote;
  "container.getInfo": ContainerInfo;
  "container.close": null;
  "app.getContext": MiniAppContext;
  "identity.getProfile": MiniAppIdentity;
  /** Mini uygulamanın kendi sunucusunun doğrulayacağı kısa ömürlü belirteç. */
  "identity.getToken": MiniAppIdentityToken;
  "scanner.scanQr": { value: string };
  "location.getCurrent": { latitude: number; longitude: number; accuracyMeters: number | null };
  "location.listCountries": { items: LocationCountry[] };
  "location.listProvinces": { items: LocationPlace[] };
  "location.listDistricts": { items: LocationPlace[] };
  "location.listNeighborhoods": { items: LocationPlace[] };
  "location.getNeighborhood": LocationPath;
  "location.listAddresses": { items: LocationAddress[] };
  "location.getAddress": LocationAddress;
  "location.createAddress": LocationAddress;
  "location.updateAddress": LocationAddress;
  "location.archiveAddress": LocationAddress;
  "payment.request": { paymentId: string; status: "paid" };
  "storage.get": { value: string | null };
  "storage.set": null;
  "storage.remove": null;
  "share.open": null;
  "ordering.getCatalog": Catalog;
  "ordering.openCart": Cart;
  "ordering.getCart": Cart;
  "ordering.replaceCart": { type: "cart" | "cart_conflict"; cart: Cart };
  "ordering.resetCart": { type: "cart" | "cart_conflict"; cart: Cart };
  "ordering.checkout": { type: "order"; order: Order } | { type: "cart_changed"; cart: Cart };
  "ordering.getOrder": Order;
  "ordering.getStore": StoreContext;
  "ordering.getSlots": { items: { at: string }[]; preparationMinutes: number; openNow: boolean };
  "tableService.join": TableSession;
  "tableService.get": TableSession;
  "tableService.getBill": { ownTotalMinor: number; ownPaidMinor: number; ownDueMinor: number };
  "tableService.request": {
    id: string;
    tableSessionId: string;
    kind: "waiter" | "bill";
    label: string;
  };
  "ordering.getEvents": LiveReplay;
  "ordering.listOrders": { items: OrderSummary[]; nextCursor: string | null };
  "ordering.reorder": ReorderResult;
  "feedback.listReviews": { items: Review[]; nextCursor: string | null };
  "feedback.createReview": Review;
  "feedback.editReview": Review;
  "feedback.listFavorites": { items: Favorite[]; nextCursor: string | null };
  "feedback.saveFavorite": Favorite;
  "returns.list": { items: ReturnRequest[] };
  "returns.create": ReturnRequest;
  "returns.withdraw": ReturnRequest;
}

export const bridgeRequestSchema = z.object({
  vado: z.literal(BRIDGE_PROTOCOL_VERSION),
  id: z.string().min(1).max(64),
  method: z.string().min(1).max(64),
  params: z.unknown().optional(),
});
export type BridgeRequest = z.infer<typeof bridgeRequestSchema>;

/**
 * Çerçeve içindeki sayfa, üst penceresine ilk iletisinde bir ileti kapısı (MessagePort) verir;
 * istekler ve yanıtlar yalnızca o kapıdan geçer. Paket kimliksiz (opak) bir kaynakta çalıştığı
 * için iletinin kimden geldiği adresinden anlaşılamaz; kapıyı ancak çerçevenin kendi sayfası
 * verebilir. Paket kapıyı sarmalayıcı belgeye, sarmalayıcı (web önizlemesinde) kabuğa verir.
 */
export const bridgeConnectSchema = z.object({
  vado: z.literal(BRIDGE_PROTOCOL_VERSION),
  type: z.literal("connect"),
});
export type BridgeConnect = z.infer<typeof bridgeConnectSchema>;

/**
 * Sarmalayıcı belgenin kabuğa bildirimi: paket, açıldığı belgeden ayrılmaya çalıştı ve
 * sarmalayıcı çerçeveyi kaldırdı. Kabuk mini uygulamanın penceresini kapatır.
 *
 * Paket bu bildirimi taklit edebilir; sonucu yalnızca kendi penceresinin kapanmasıdır.
 */
export const bridgeLeftSchema = z.object({
  vado: z.literal(BRIDGE_PROTOCOL_VERSION),
  type: z.literal("left"),
});
export type BridgeLeft = z.infer<typeof bridgeLeftSchema>;

export const BRIDGE_ERROR_CODES = [
  "unknown_method",
  "invalid_params",
  "capability_denied",
  "user_denied",
  "unavailable",
  "failed",
] as const;
export type BridgeErrorCode = (typeof BRIDGE_ERROR_CODES)[number];

export interface BridgeError {
  code: BridgeErrorCode;
  message: string;
}

export type BridgeResponse =
  | { vado: typeof BRIDGE_PROTOCOL_VERSION; id: string; ok: true; result: unknown }
  | { vado: typeof BRIDGE_PROTOCOL_VERSION; id: string; ok: false; error: BridgeError };

export const orderingNoticeSchema = z.object({
  vado: z.literal(BRIDGE_PROTOCOL_VERSION),
  type: z.literal("event"),
  name: z.enum(["ordering.changed", "ordering.connection"]),
  connected: z.boolean().optional(),
});
