import type {
  CreateCustomerAddressBody,
  CreateLocationServiceAreaBody,
  CustomerAddress,
  LocationDistrict,
  LocationNeighborhood,
  LocationProvince,
  LocationServiceArea,
  UpdateCustomerAddressBody,
  UpdateLocationServiceAreaBody,
} from "@vado/contracts";

import type { AppContext } from "../../core/context";
import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { requireBusinessRole, type TenantScope, withTenant } from "../../core/tenant-scope";

interface CustomerAddressRow {
  id: string;
  business_id: string;
  business_customer_id: string;
  label: string;
  province_id: string;
  district_id: string;
  neighborhood_id: string;
  address_line: string;
  recipient_name: string;
  recipient_phone: string;
  version: number;
}

interface ServiceAreaRow {
  id: string;
  business_id: string;
  branch_id: string;
  name: string;
  active: boolean;
  version: number;
  neighborhood_ids: string[];
}

function customer(scope: TenantScope): { customerId: string } {
  if (scope.role !== "customer" || scope.businessCustomerId === null) {
    throw new AppError("forbidden");
  }
  return { customerId: scope.businessCustomerId };
}

function addressView(row: CustomerAddressRow): CustomerAddress {
  return {
    id: row.id,
    businessId: row.business_id,
    businessCustomerId: row.business_customer_id,
    label: row.label,
    provinceId: row.province_id,
    districtId: row.district_id,
    neighborhoodId: row.neighborhood_id,
    addressLine: row.address_line,
    recipientName: row.recipient_name,
    recipientPhone: row.recipient_phone,
    version: row.version,
  };
}

function areaView(row: ServiceAreaRow): LocationServiceArea {
  return {
    id: row.id,
    businessId: row.business_id,
    branchId: row.branch_id,
    name: row.name,
    active: row.active,
    neighborhoodIds: row.neighborhood_ids,
    version: row.version,
  };
}

async function requireHierarchy(
  tx: Database,
  provinceId: string,
  districtId: string,
  neighborhoodId: string,
): Promise<void> {
  const row = await tx.maybeOne(sql`
    select 1 from location_neighborhoods
    where province_id=${provinceId} and district_id=${districtId} and id=${neighborhoodId}
  `);
  if (row === null) throw new AppError("validation_failed");
}

export function createLocationService({ db }: AppContext) {
  const provinces = (): Promise<LocationProvince[]> =>
    db.many(sql`select id,name,slug from location_provinces order by name,id`);

  const districts = (provinceId: string): Promise<LocationDistrict[]> =>
    db.many(sql`
      select id,province_id as "provinceId",name,slug
      from location_districts where province_id=${provinceId} order by name,id
    `);

  const neighborhoods = (provinceId: string, districtId: string): Promise<LocationNeighborhood[]> =>
    db.many(sql`
      select id,province_id as "provinceId",district_id as "districtId",name,slug,
        postal_code as "postalCode"
      from location_neighborhoods
      where province_id=${provinceId} and district_id=${districtId}
      order by name,id
    `);

  function addresses(scope: TenantScope): Promise<CustomerAddress[]> {
    const { customerId } = customer(scope);
    return withTenant(db, scope, async (tx) =>
      (
        await tx.many<CustomerAddressRow>(sql`
          select * from customer_addresses
          where business_id=${scope.businessId} and business_customer_id=${customerId}
          order by created_at,id
        `)
      ).map(addressView),
    );
  }

  function createAddress(
    scope: TenantScope,
    body: CreateCustomerAddressBody,
  ): Promise<CustomerAddress> {
    const { customerId } = customer(scope);
    return withTenant(db, scope, async (tx) => {
      await requireHierarchy(tx, body.provinceId, body.districtId, body.neighborhoodId);
      const row = await tx.one<CustomerAddressRow>(sql`
        insert into customer_addresses(
          business_id,business_customer_id,label,province_id,district_id,neighborhood_id,
          address_line,recipient_name,recipient_phone
        ) values (
          ${scope.businessId},${customerId},${body.label},${body.provinceId},${body.districtId},
          ${body.neighborhoodId},${body.addressLine},${body.recipientName},${body.recipientPhone}
        ) returning *
      `);
      return addressView(row);
    });
  }

  function updateAddress(
    scope: TenantScope,
    id: string,
    body: UpdateCustomerAddressBody,
  ): Promise<CustomerAddress> {
    const { customerId } = customer(scope);
    return withTenant(db, scope, async (tx) => {
      await requireHierarchy(tx, body.provinceId, body.districtId, body.neighborhoodId);
      const current = await tx.maybeOne<{ version: number }>(sql`
        select version from customer_addresses
        where business_id=${scope.businessId} and business_customer_id=${customerId} and id=${id}
        for update
      `);
      if (current === null) throw new AppError("not_found");
      if (current.version !== body.expectedVersion) {
        throw new AppError("settings_version_conflict");
      }
      const row = await tx.one<CustomerAddressRow>(sql`
        update customer_addresses set
          label=${body.label},province_id=${body.provinceId},district_id=${body.districtId},
          neighborhood_id=${body.neighborhoodId},address_line=${body.addressLine},
          recipient_name=${body.recipientName},recipient_phone=${body.recipientPhone},
          version=version+1
        where business_id=${scope.businessId} and business_customer_id=${customerId} and id=${id}
        returning *
      `);
      return addressView(row);
    });
  }

  function deleteAddress(scope: TenantScope, id: string, expectedVersion: number): Promise<void> {
    const { customerId } = customer(scope);
    return withTenant(db, scope, async (tx) => {
      const current = await tx.maybeOne<{ version: number }>(sql`
        select version from customer_addresses
        where business_id=${scope.businessId} and business_customer_id=${customerId} and id=${id}
        for update
      `);
      if (current === null) throw new AppError("not_found");
      if (current.version !== expectedVersion) throw new AppError("settings_version_conflict");
      await tx.execute(sql`
        delete from customer_addresses
        where business_id=${scope.businessId} and business_customer_id=${customerId} and id=${id}
      `);
    });
  }

  async function serviceAreas(
    scope: TenantScope,
    branchId?: string,
  ): Promise<LocationServiceArea[]> {
    requireBusinessRole(scope, ["owner", "manager", "staff"]);
    return withTenant(db, scope, async (tx) => {
      const rows =
        branchId === undefined
          ? await tx.many<ServiceAreaRow>(sql`
              select a.id,a.business_id,a.branch_id,a.name,a.active,a.version,
                coalesce(array_agg(n.neighborhood_id order by n.neighborhood_id)
                  filter(where n.neighborhood_id is not null),array[]::text[]) as neighborhood_ids
              from location_service_areas a
              left join location_service_area_neighborhoods n
                on n.business_id=a.business_id and n.service_area_id=a.id
              where a.business_id=${scope.businessId}
              group by a.id,a.business_id,a.branch_id,a.name,a.active,a.version
              order by a.name,a.id
            `)
          : await tx.many<ServiceAreaRow>(sql`
              select a.id,a.business_id,a.branch_id,a.name,a.active,a.version,
                coalesce(array_agg(n.neighborhood_id order by n.neighborhood_id)
                  filter(where n.neighborhood_id is not null),array[]::text[]) as neighborhood_ids
              from location_service_areas a
              left join location_service_area_neighborhoods n
                on n.business_id=a.business_id and n.service_area_id=a.id
              where a.business_id=${scope.businessId} and a.branch_id=${branchId}
              group by a.id,a.business_id,a.branch_id,a.name,a.active,a.version
              order by a.name,a.id
            `);
      return rows.map(areaView);
    });
  }

  async function replaceAreaNeighborhoods(
    tx: Database,
    scope: TenantScope,
    areaId: string,
    neighborhoodIds: readonly string[],
  ): Promise<void> {
    const found = await tx.many<{ id: string; province_id: string; district_id: string }>(sql`
      select id,province_id,district_id from location_neighborhoods
      where id=any(${neighborhoodIds}::text[])
    `);
    if (found.length !== neighborhoodIds.length) throw new AppError("validation_failed");
    await tx.execute(sql`
      delete from location_service_area_neighborhoods
      where business_id=${scope.businessId} and service_area_id=${areaId}
    `);
    for (const row of found) {
      await tx.execute(sql`
        insert into location_service_area_neighborhoods(
          business_id,service_area_id,province_id,district_id,neighborhood_id
        ) values(
          ${scope.businessId},${areaId},${row.province_id},${row.district_id},${row.id}
        )
      `);
    }
  }

  function createServiceArea(
    scope: TenantScope,
    body: CreateLocationServiceAreaBody,
  ): Promise<LocationServiceArea> {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, async (tx) => {
      const branch = await tx.maybeOne(sql`
        select 1 from branches
        where business_id=${scope.businessId} and id=${body.branchId} and active for share
      `);
      if (branch === null) throw new AppError("not_found");
      const row = await tx.one<Omit<ServiceAreaRow, "neighborhood_ids">>(sql`
        insert into location_service_areas(business_id,branch_id,name,active)
        values(${scope.businessId},${body.branchId},${body.name},${body.active})
        returning id,business_id,branch_id,name,active,version
      `);
      await replaceAreaNeighborhoods(tx, scope, row.id, body.neighborhoodIds);
      return areaView({ ...row, neighborhood_ids: [...body.neighborhoodIds].sort() });
    });
  }

  function updateServiceArea(
    scope: TenantScope,
    id: string,
    body: UpdateLocationServiceAreaBody,
  ): Promise<LocationServiceArea> {
    requireBusinessRole(scope, ["owner", "manager"]);
    return withTenant(db, scope, async (tx) => {
      const current = await tx.maybeOne<{ version: number; branch_id: string }>(sql`
        select version,branch_id from location_service_areas
        where business_id=${scope.businessId} and id=${id} for update
      `);
      if (current === null) throw new AppError("not_found");
      if (current.version !== body.expectedVersion) {
        throw new AppError("settings_version_conflict");
      }
      if (current.branch_id !== body.branchId) throw new AppError("validation_failed");
      const row = await tx.one<Omit<ServiceAreaRow, "neighborhood_ids">>(sql`
        update location_service_areas set
          name=${body.name},active=${body.active},version=version+1
        where business_id=${scope.businessId} and id=${id}
        returning id,business_id,branch_id,name,active,version
      `);
      await replaceAreaNeighborhoods(tx, scope, id, body.neighborhoodIds);
      return areaView({ ...row, neighborhood_ids: [...body.neighborhoodIds].sort() });
    });
  }

  function matchingServiceAreas(
    scope: TenantScope,
    branchId: string,
    neighborhoodId: string,
  ): Promise<{ id: string; name: string }[]> {
    return withTenant(db, scope, (tx) =>
      tx.many(sql`
        select a.id,a.name
        from location_service_areas a
        join location_service_area_neighborhoods n
          on n.business_id=a.business_id and n.service_area_id=a.id
        where a.business_id=${scope.businessId} and a.branch_id=${branchId}
          and a.active and n.neighborhood_id=${neighborhoodId}
        order by a.name,a.id
      `),
    );
  }

  return {
    provinces,
    districts,
    neighborhoods,
    addresses,
    createAddress,
    updateAddress,
    deleteAddress,
    serviceAreas,
    createServiceArea,
    updateServiceArea,
    matchingServiceAreas,
  };
}
