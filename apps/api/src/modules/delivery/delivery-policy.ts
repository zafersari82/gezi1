import type { DeliveryQuote } from "@vado/contracts";

import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import type { TenantScope } from "../../core/tenant-scope";
import { readOwnedAddress } from "../location/location-addresses";
import { readMatchingServiceAreas } from "../location/location-areas";
import type { FulfilmentPolicy } from "../ordering/fulfilment";
export const deliveryFulfilmentPolicy: FulfilmentPolicy = {
  supports: (caps, choice) =>
    choice.fulfilment === "delivery" && caps.includes("ordering.delivery@1.0.0"),
  async validate(tx, scope, branchId, choice, checkout) {
    if (choice.tableSessionId !== null || !choice.addressId)
      throw new AppError("fulfilment_unavailable");
    if (checkout) {
      const row = await tx.one<{ open: boolean }>(
        sql`select branch_is_open(${scope.businessId},${branchId},now()) as open`,
      );
      if (!row.open) throw new AppError("branch_closed");
    }
  },
};
export async function quoteDelivery(
  tx: Database,
  scope: TenantScope,
  branchId: string,
  addressId: string,
  scheduledAt: string | null,
): Promise<DeliveryQuote> {
  if (scope.role !== "customer") throw new AppError("forbidden");
  const address = await readOwnedAddress(tx, scope.userId, addressId);
  if (address.archived) throw new AppError("fulfilment_unavailable");
  const areas = await readMatchingServiceAreas(tx, scope, branchId, address.neighborhoodId);
  const regions = await tx.many<{
    area_id: string;
    version: number;
    fee_minor: number;
    minimum_minor: number;
    delivery_minutes: number;
  }>(
    sql`select * from delivery_regions where business_id=${scope.businessId} and branch_id=${branchId} and area_id=any(${areas.map((a) => a.id)}::uuid[]) and active order by fee_minor,area_id`,
  );
  const region = regions[0],
    area = areas.find((a) => a.id === region?.area_id);
  if (region === undefined || area === undefined) throw new AppError("fulfilment_unavailable");
  const settings = await tx.one<{
    preparation_minutes: number;
    slot_minutes: number;
    allowed: boolean;
  }>(
    sql`select coalesce(s.preparation_minutes,20) as preparation_minutes,coalesce(s.slot_minutes,15) as slot_minutes,delivery_time_allowed(b.business_id,b.id,${scheduledAt}::timestamptz,${region.delivery_minutes}) as allowed from branches b left join branch_ordering_settings s on s.business_id=b.business_id and s.branch_id=b.id where b.business_id=${scope.businessId} and b.id=${branchId} for share of b`,
  );
  if (!settings.allowed) throw new AppError("fulfilment_unavailable");
  return {
    areaId: area.id,
    areaVersion: area.version,
    regionVersion: region.version,
    feeMinor: region.fee_minor,
    minimumMinor: region.minimum_minor,
    deliveryMinutes: region.delivery_minutes,
    preparationMinutes: settings.preparation_minutes,
    slotMinutes: settings.slot_minutes,
    address,
    scheduledAt,
  };
}
