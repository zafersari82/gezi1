import { type Database, sql } from "../../core/database";

/**
 * Public discovery read boundary: the platform connection can see tenant records,
 * so this reader has ONE parametrised read and returns ONLY published delivery
 * metadata. Never pass its privileged Database to general discovery or controllers.
 * Address ownership is checked in the ordinary user-scoped connection beforehand.
 */
export interface PublicDeliveryOption {
  business_id: string;
  branch_id: string;
  branch_name: string;
  fee_minor: number;
  minimum_minor: number;
  delivery_minutes: number;
}

export function createDeliveryAvailabilityReader(platformDb: Database) {
  return {
    /** Region, capability, branch and opening hours are live at query time. */
    readByNeighborhood(neighborhoodId: string): Promise<PublicDeliveryOption[]> {
      return platformDb.many<PublicDeliveryOption>(sql`
        select distinct on (b.business_id)
          b.business_id, b.id as branch_id, b.name as branch_name,
          r.fee_minor, r.minimum_minor, r.delivery_minutes
        from location_service_area_neighborhoods n
        join location_service_areas a on a.business_id=n.business_id
          and a.branch_id=n.branch_id and a.id=n.area_id and a.active
        join delivery_regions r on r.business_id=a.business_id
          and r.branch_id=a.branch_id and r.area_id=a.id and r.active
        join branches b on b.business_id=r.business_id and b.id=r.branch_id and b.active
        join businesses biz on biz.id=b.business_id
          and biz.verified and biz.status='active'
        where n.neighborhood_id=${neighborhoodId}
          and exists (
            select 1 from app_instances inst
            join app_instance_capabilities cap on cap.business_id=inst.business_id
              and cap.app_instance_id=inst.id
              and cap.capability_id='ordering.delivery' and cap.version='1.0.0' and cap.enabled
            where inst.business_id=b.business_id and inst.active and inst.engine='ordering'
          )
          and delivery_time_allowed(b.business_id,b.id,null,r.delivery_minutes)
        order by b.business_id, r.fee_minor, r.delivery_minutes, b.id
      `);
    },
  };
}

export type DeliveryAvailabilityReader = ReturnType<typeof createDeliveryAvailabilityReader>;
