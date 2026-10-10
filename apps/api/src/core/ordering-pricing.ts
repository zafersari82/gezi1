import type { Cart, IncentiveChoice, IncentiveQuote } from "@vado/contracts";

import type { Database } from "./database";
import type { TenantScope } from "./tenant-scope";
export interface OrderPricingInput {
  cartId: string;
  branchId: string;
  choice: IncentiveChoice;
  lines: Cart["lines"];
  lock: boolean;
}
/** Motor fiyatı hesaplayan platformu tüketir; kampanya ya da puan defterini kendisi yönetmez. */
export type OrderPricing = (
  tx: Database,
  scope: TenantScope,
  input: OrderPricingInput,
) => Promise<{ lines: Cart["lines"]; incentives: IncentiveQuote }>;
