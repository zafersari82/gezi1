import { z } from "zod";

import { idSchema } from "./common";

/** Paketlerin kaydettiği teslim biçimleri. Çekirdek bir biçimin adını bilmez. */
export const fulfilmentSchema = z.enum(["pickup", "dine_in", "delivery"]);
export type Fulfilment = z.infer<typeof fulfilmentSchema>;
/** Sunucu teslim biçimi kayıtlarındaki tahsilat yerleriyle aynı sırada tanımlanır. */
export const PAYMENT_PLACES = ["counter", "table", "delivery"] as const;
export type PaymentPlace = (typeof PAYMENT_PLACES)[number];
export const FULFILMENT_PAYMENT_PLACES: Readonly<
  Record<Fulfilment, readonly [PaymentPlace, ...PaymentPlace[]]>
> = {
  pickup: ["counter"],
  dine_in: ["table", "counter"],
  delivery: ["delivery", "counter"],
};

export const FULFILMENT_LABELS: Readonly<Record<Fulfilment, string>> = {
  pickup: "Gel-al",
  dine_in: "Masada servis",
  delivery: "Adrese teslim",
};
/** Paketlerin kaydettiği sipariş bağlamı türleri (masa servisi: masa oturumu). */
export const ORDER_CONTEXT_KINDS = ["table_session"] as const;
export const orderContextSchema = z
  .object({ kind: z.enum(ORDER_CONTEXT_KINDS), id: idSchema })
  .strict();
export type OrderContext = z.infer<typeof orderContextSchema>;
