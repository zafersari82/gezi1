import {
  type DeliveryQuoteBody,
  deliveryQuoteSchema,
  type DeliveryRegionBody,
} from "@vado/contracts";

import { recordAudit } from "../../core/audit";
import type { TenantContext } from "../../core/context";
import { sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { appendEvent } from "../../core/outbox-events";
import { requireBusinessRole, type TenantScope, withTenant } from "../../core/tenant-scope";
import { withUser } from "../../core/user-scope";
import { locationMutation } from "../location/location-mutation";
import { quoteDelivery } from "./delivery-policy";
export function createDeliveryService({ db }: TenantContext) {
  return {
    quote(scope: TenantScope, body: DeliveryQuoteBody) {
      if (scope.role !== "customer" || scope.appInstanceId === null)
        throw new AppError("forbidden");
      return withTenant(db, scope, async (tx) => {
        const allowed = await tx.one<{ allowed: boolean }>(
          sql`select ordering_capabilities_for_instance(${scope.businessId},${scope.appInstanceId}) ? 'ordering.delivery@1.0.0' as allowed`,
        );
        if (!allowed.allowed) throw new AppError("fulfilment_unavailable");
        return quoteDelivery(tx, scope, body.branchId, body.addressId, body.scheduledAt ?? null);
      });
    },
    snapshot(scope: TenantScope, orderId: string) {
      if (
        scope.role !== "customer" ||
        scope.businessCustomerId === null ||
        scope.appInstanceId === null
      )
        throw new AppError("forbidden");
      return withTenant(db, scope, async (tx) => {
        const row = await tx.maybeOne<{ snapshot: unknown }>(
          sql`select s.snapshot from delivery_order_snapshots s join orders o on o.business_id=s.business_id and o.id=s.order_id where s.business_id=${scope.businessId} and s.order_id=${orderId} and o.business_customer_id=${scope.businessCustomerId} and o.app_instance_id=${scope.appInstanceId}`,
        );
        if (row === null) throw new AppError("not_found");
        return deliveryQuoteSchema.parse(row.snapshot);
      });
    },
    setRegion(
      scope: TenantScope,
      branchId: string,
      areaId: string,
      key: string,
      body: DeliveryRegionBody,
    ) {
      requireBusinessRole(scope, ["owner", "manager"]);
      return withUser(db, scope.userId, (tx) =>
        withTenant(tx, scope, async (tx) => {
          await tx.execute(
            sql`select pg_advisory_xact_lock(hashtextextended(${scope.businessId + ":" + branchId},728))`,
          );
          return locationMutation(
            tx,
            scope.userId,
            scope.businessId,
            `delivery.region:${branchId}:${areaId}`,
            key,
            body,
            async () => {
              const area = await tx.maybeOne(
                sql`select id from location_service_areas where business_id=${scope.businessId} and branch_id=${branchId} and id=${areaId} and active for share`,
              );
              if (area === null) throw new AppError("not_found");
              const current = await tx.maybeOne<{ version: number }>(
                sql`select version from delivery_regions where business_id=${scope.businessId} and branch_id=${branchId} and area_id=${areaId} for update`,
              );
              if ((current?.version ?? 0) !== body.expectedVersion)
                throw new AppError("settings_version_conflict");
              const version = (current?.version ?? 0) + 1;
              await tx.execute(
                sql`insert into delivery_regions(business_id,branch_id,area_id,version,fee_minor,minimum_minor,delivery_minutes,active) values(${scope.businessId},${branchId},${areaId},${version},${body.feeMinor},${body.minimumMinor},${body.deliveryMinutes},${body.active}) on conflict(business_id,branch_id,area_id) do update set version=excluded.version,fee_minor=excluded.fee_minor,minimum_minor=excluded.minimum_minor,delivery_minutes=excluded.delivery_minutes,active=excluded.active`,
              );
              const region = await tx.one<{ id: string }>(
                sql`select id from delivery_regions where business_id=${scope.businessId} and branch_id=${branchId} and area_id=${areaId}`,
              );
              await recordAudit(tx, {
                actor: scope.userId,
                action: "delivery.region_updated",
                targetType: "delivery_region",
                targetId: areaId,
                metadata: { businessId: scope.businessId, version },
              });
              await appendEvent(tx, scope, {
                type: "delivery.region_updated",
                aggregateId: region.id,
                sequence: version,
                payload: { areaId, branchId, version },
              });
              return {
                areaId,
                branchId,
                version,
                feeMinor: body.feeMinor,
                minimumMinor: body.minimumMinor,
                deliveryMinutes: body.deliveryMinutes,
                active: body.active,
              };
            },
          );
        }),
      );
    },
  };
}
