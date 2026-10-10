import type { Database } from "../../core/database";
import { sql } from "../../core/database";
import { AppError } from "../../core/errors";
import type { TenantScope } from "../../core/tenant-scope";
export interface FulfilmentChoice {
  fulfilment: "pickup" | "dine_in" | "delivery";
  tableSessionId: string | null;
  scheduledAt: string | null;
  addressId?: string | null;
}
export interface FulfilmentPolicy {
  supports: (capabilities: readonly string[], choice: FulfilmentChoice) => boolean;
  validate: (
    tx: Database,
    scope: TenantScope,
    branchId: string,
    choice: FulfilmentChoice,
    checkout: boolean,
  ) => Promise<void>;
}
export function createFulfilmentValidator(policies: readonly FulfilmentPolicy[]) {
  return async (
    tx: Database,
    scope: TenantScope,
    branchId: string,
    choice: FulfilmentChoice,
    checkout = false,
  ) => {
    const { capabilities } = await tx.one<{ capabilities: string[] }>(
      sql`select ordering_capabilities_for_instance(${scope.businessId},${scope.appInstanceId}) as capabilities`,
    );
    const policy = policies.find((p) => p.supports(capabilities, choice));
    if (policy === undefined) throw new AppError("fulfilment_unavailable");
    await policy.validate(tx, scope, branchId, choice, checkout);
  };
}
