import { sql } from "../../core/database";
import { AppError } from "../../core/errors";
import type { FulfilmentPolicy } from "../ordering/fulfilment";
export const restaurantFulfilmentPolicy: FulfilmentPolicy = {
  supports: (_, choice) => choice.fulfilment !== "delivery",
  async validate(tx, scope, branchId, choice, checkout) {
    const row = await tx.one<{ allowed: boolean; open: boolean; restaurant: boolean }>(
      sql`select restaurant_fulfilment_allowed(${scope.businessId},${scope.appInstanceId},${branchId},${choice.fulfilment},${choice.scheduledAt}::timestamptz,${choice.tableSessionId}::uuid,${scope.businessCustomerId}) as allowed,branch_is_open(${scope.businessId},${branchId},now()) as open,ordering_capabilities_for_instance(${scope.businessId},${scope.appInstanceId}) ?| array['ordering.kitchen@1.0.0','ordering.table_service@1.0.0','ordering.pickup@1.0.0','ordering.scheduling@1.0.0'] as restaurant`,
    );
    if (checkout && row.restaurant && !row.open) throw new AppError("branch_closed");
    if (!row.allowed) throw new AppError("fulfilment_unavailable");
  },
};
