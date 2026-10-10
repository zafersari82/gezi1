import type { Cart, OrderContext } from "@vado/contracts";

import type { Database } from "../../core/database";
import { sql } from "../../core/database";
import { AppError } from "../../core/errors";
import type { TenantScope } from "../../core/tenant-scope";

export interface FulfilmentChoice {
  fulfilment: Cart["fulfilment"];
  context: OrderContext | null;
  scheduledAt: string | null;
  addressId?: string | null;
}

/**
 * Teslim biçimi, bağlam ve saat bu uygulama örneğinde geçerli mi? Kural veritabanındaki paket
 * kaydındadır (`ordering_fulfilment_status`); sepet ve sipariş tetikleyicileri de aynı işlevi
 * kullanır. Burada kullanıcıya doğru hata kodunu vermek için önceden sorulur.
 */
export async function validateFulfilment(
  tx: Database,
  scope: TenantScope,
  branchId: string,
  choice: FulfilmentChoice,
  checkout = false,
): Promise<void> {
  if (scope.appInstanceId === null || scope.businessCustomerId === null)
    throw new AppError("forbidden");
  const { status } = await tx.one<{ status: string }>(sql`
    select ordering_fulfilment_status(
      ${scope.businessId}, ${scope.appInstanceId}, ${branchId}, ${choice.fulfilment},
      ${choice.scheduledAt}::timestamptz, ${choice.context?.kind ?? null},
      ${choice.context?.id ?? null}::uuid, ${scope.businessCustomerId},
      ${choice.addressId ?? null}::uuid, ${checkout}
    ) as status
  `);
  if (status === "closed") throw new AppError("branch_closed");
  if (status !== "ok") throw new AppError("fulfilment_unavailable");
}
