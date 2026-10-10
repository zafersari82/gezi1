import type { LocationArea, LocationAreaBody, LocationAreaUpdateBody } from "@vado/contracts";

import { recordAudit } from "../../core/audit";
import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { appendEvent } from "../../core/outbox-events";
import {
  type PersonalTenantScope,
  requireBusinessRole,
  type TenantScope,
  withTenant,
} from "../../core/tenant-scope";
import { withUser } from "../../core/user-scope";
import { requireLocationCatalog } from "./location-catalog";
import { locationMutation } from "./location-mutation";
interface AreaRow {
  id: string;
  business_id: string;
  branch_id: string;
  name: string;
  version: number;
  active: boolean;
  created_at: Date;
  updated_at: Date;
}
function scoped<T>(
  db: Database,
  scope: TenantScope,
  run: (tx: Database) => Promise<T>,
): Promise<T> {
  requireBusinessRole(scope, ["owner", "manager", "staff"]);
  return withUser(db, scope.userId, (tx) => withTenant(tx, scope, run));
}
async function requireBranch(tx: Database, scope: TenantScope, branchId: string) {
  if (
    (await tx.maybeOne(
      sql`select id from branches where business_id=${scope.businessId} and id=${branchId} for share`,
    )) === null
  )
    throw new AppError("not_found");
}
async function toArea(tx: Database, r: AreaRow): Promise<LocationArea> {
  const neighborhoods = await tx.many<{ neighborhood_id: string }>(
    sql`select neighborhood_id from location_service_area_neighborhoods where business_id=${r.business_id} and branch_id=${r.branch_id} and area_id=${r.id} order by neighborhood_id`,
  );
  return {
    id: r.id,
    businessId: r.business_id,
    branchId: r.branch_id,
    name: r.name,
    version: r.version,
    active: r.active,
    createdAt: r.created_at.toISOString(),
    updatedAt: r.updated_at.toISOString(),
    neighborhoodIds: neighborhoods.map((n) => n.neighborhood_id),
  };
}
async function requireArea(tx: Database, scope: TenantScope, branchId: string, id: string) {
  const old = await tx.maybeOne<AreaRow>(
    sql`select * from location_service_areas where business_id=${scope.businessId} and branch_id=${branchId} and id=${id} for update`,
  );
  if (old === null) throw new AppError("not_found");
  return old;
}
/** Business işleminin kapsamı ve şubesi korunarak bölge görüntüsü okunur. */
export async function readServiceAreas(
  tx: Database,
  scope: TenantScope,
  branchId: string,
): Promise<LocationArea[]> {
  return scoped(tx, scope, async (db) => {
    await requireBranch(db, scope, branchId);
    const rows = await db.many<AreaRow>(
      sql`select * from location_service_areas where business_id=${scope.businessId} and branch_id=${branchId} order by name,id`,
    );
    return Promise.all(rows.map((r) => toArea(db, r)));
  });
}
/** Ücret politikası tüketicisine yalnız kendi işletme/şubesindeki etkin mahalle eşleşmeleri verilir. */
export function readMatchingServiceAreas(
  tx: Database,
  scope: TenantScope,
  branchId: string,
  neighborhoodId: string,
): Promise<LocationArea[]> {
  if (scope.role === "device") throw new AppError("forbidden");
  return withUser(tx, scope.userId, (db) =>
    withTenant(db, scope, async (scoped) => {
      await requireBranch(scoped, scope, branchId);
      await scoped.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${scope.businessId + ":" + branchId},728))`,
      );
      const rows = await scoped.many<AreaRow>(
        sql`select a.* from location_service_areas a where a.business_id=${scope.businessId} and a.branch_id=${branchId} and a.active and exists(select 1 from location_service_area_neighborhoods n where n.business_id=a.business_id and n.branch_id=a.branch_id and n.area_id=a.id and n.neighborhood_id=${neighborhoodId}) order by a.id`,
      );
      return Promise.all(rows.map((r) => toArea(scoped, r)));
    }),
  );
}
export function createLocationAreas(db: Database) {
  async function neighborhoods(
    tx: Database,
    scope: PersonalTenantScope,
    branchId: string,
    id: string,
    ids: string[],
  ) {
    await requireLocationCatalog(tx);
    const found = await tx.many<{ id: string }>(
      sql`select id from location_neighborhoods where id=any(${ids}::uuid[])`,
    );
    if (found.length !== ids.length) throw new AppError("location_parent_invalid");
    await tx.execute(
      sql`delete from location_service_area_neighborhoods where business_id=${scope.businessId} and branch_id=${branchId} and area_id=${id}`,
    );
    for (const neighborhoodId of ids)
      await tx.execute(
        sql`insert into location_service_area_neighborhoods(business_id,branch_id,area_id,neighborhood_id) values(${scope.businessId},${branchId},${id},${neighborhoodId})`,
      );
  }
  function mutate<T extends Record<string, unknown>>(
    scope: TenantScope,
    branchId: string,
    key: string,
    operation: string,
    body: unknown,
    run: (tx: Database, owner: PersonalTenantScope) => Promise<T>,
  ) {
    requireBusinessRole(scope, ["owner", "manager"]);
    return scoped(db, scope, async (tx) => {
      await requireBranch(tx, scope, branchId);
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtextextended(${scope.businessId + ":" + branchId},728))`,
      );
      return locationMutation(
        tx,
        scope.userId,
        scope.businessId,
        `${operation}:${scope.businessId}:${branchId}`,
        key,
        body,
        () => run(tx, scope),
      );
    });
  }
  async function audit(
    tx: Database,
    scope: PersonalTenantScope,
    id: string,
    action: string,
    version: number,
  ) {
    await recordAudit(tx, {
      actor: scope.userId,
      action,
      targetType: "location_service_area",
      targetId: id,
      metadata: { businessId: scope.businessId },
    });
    await appendEvent(tx, scope, {
      type: action,
      aggregateId: id,
      sequence: version,
      payload: { areaId: id, version },
    });
  }
  return {
    findServiceAreas: (scope: TenantScope, branchId: string, neighborhoodId: string) =>
      readMatchingServiceAreas(db, scope, branchId, neighborhoodId),
    listServiceAreas: async (scope: TenantScope, branchId: string) => ({
      items: await readServiceAreas(db, scope, branchId),
    }),
    createServiceArea: (
      scope: TenantScope,
      branchId: string,
      key: string,
      body: LocationAreaBody,
    ) =>
      mutate(scope, branchId, key, "location.area.create", body, async (tx, owner) => {
        const r = await tx.one<AreaRow>(
          sql`insert into location_service_areas(business_id,branch_id,name) values(${scope.businessId},${branchId},${body.name}) returning *`,
        );
        await neighborhoods(tx, owner, branchId, r.id, body.neighborhoodIds);
        await audit(tx, owner, r.id, "location.area_created", r.version);
        return toArea(tx, r);
      }),
    updateServiceArea: (
      scope: TenantScope,
      branchId: string,
      id: string,
      key: string,
      body: LocationAreaUpdateBody,
    ) =>
      mutate(scope, branchId, key, `location.area.update:${id}`, body, async (tx, owner) => {
        const old = await requireArea(tx, scope, branchId, id);
        if (old.version !== body.expectedVersion) throw new AppError("location_version_conflict");
        if (!old.active) throw new AppError("location_inactive");
        const r = await tx.one<AreaRow>(
          sql`update location_service_areas set name=${body.name},version=version+1 where business_id=${scope.businessId} and branch_id=${branchId} and id=${id} returning *`,
        );
        await neighborhoods(tx, owner, branchId, id, body.neighborhoodIds);
        await audit(tx, owner, id, "location.area_updated", r.version);
        return toArea(tx, r);
      }),
    disableServiceArea: (
      scope: TenantScope,
      branchId: string,
      id: string,
      key: string,
      body: { expectedVersion: number },
    ) =>
      mutate(scope, branchId, key, `location.area.disable:${id}`, body, async (tx, owner) => {
        const old = await requireArea(tx, scope, branchId, id);
        if (old.version !== body.expectedVersion) throw new AppError("location_version_conflict");
        if (!old.active) throw new AppError("location_inactive");
        const r = await tx.one<AreaRow>(
          sql`update location_service_areas set active=false,version=version+1 where business_id=${scope.businessId} and branch_id=${branchId} and id=${id} returning *`,
        );
        await audit(tx, owner, id, "location.area_disabled", r.version);
        return toArea(tx, r);
      }),
  };
}
