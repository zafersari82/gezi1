import type {
  CapabilitySetting,
  CapabilitySettingBody,
  InstanceCapabilities,
} from "@vado/contracts";

import type { TenantContext } from "../../core/context";
import { type Database, sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { requireBusinessRole, type TenantScope, withTenant } from "../../core/tenant-scope";
import {
  CapabilityValidationError,
  getCapabilityCatalog,
  resolveCapabilities,
  validateCapabilitySelection,
} from "./capabilities.registry";

export function createCapabilityService({ db }: TenantContext) {
  async function read(
    tx: Database,
    scope: TenantScope,
    instanceId: string,
  ): Promise<InstanceCapabilities> {
    const instance = await tx.maybeOne(
      sql`select id from app_instances where business_id=${scope.businessId} and id=${instanceId} and engine='ordering' for share`,
    );
    if (instance === null) throw new AppError("not_found");
    const stored = await tx.many<{
      capability_id: string;
      version: string;
      enabled: boolean;
      config: CapabilitySetting["config"];
    }>(
      sql`select * from app_instance_capabilities where business_id=${scope.businessId} and app_instance_id=${instanceId} order by capability_id`,
    );
    const settings = stored.map((s) => ({
      capabilityId: s.capability_id,
      version: s.version,
      enabled: s.enabled,
      config: s.config,
    }));
    return {
      businessId: scope.businessId,
      appInstanceId: instanceId,
      engine: "ordering",
      ...resolveCapabilities(settings),
    };
  }
  function get(scope: TenantScope, instanceId: string) {
    requireBusinessRole(scope, ["owner", "manager", "staff"]);
    return withTenant(db, scope, (tx) => read(tx, scope, instanceId));
  }
  async function set(
    scope: TenantScope,
    instanceId: string,
    capabilityId: string,
    body: CapabilitySettingBody,
  ) {
    requireBusinessRole(scope, ["owner", "manager"]);
    try {
      return await withTenant(db, scope, async (tx) => {
        const instance = await tx.maybeOne(
          sql`select id from app_instances where business_id=${scope.businessId} and id=${instanceId} and engine='ordering' for update`,
        );
        if (instance === null) throw new AppError("not_found");
        const current = await read(tx, scope, instanceId);
        const checked = validateCapabilitySelection([
          ...current.settings.filter((s) => s.capabilityId !== capabilityId),
          { capabilityId, ...body },
        ]);
        const selected = checked.find((s) => s.capabilityId === capabilityId);
        if (selected === undefined) throw new AppError("validation_failed");
        if (!selected.enabled && capabilityId !== "ordering.preparation") {
          const inUse =
            await tx.maybeOne(sql`select 1 from orders where business_id=${scope.businessId} and app_instance_id=${instanceId}
            and status not in ('completed','rejected','cancelled') and capabilities ? ${`${capabilityId}@${body.version}`} union all
            select 1 from table_sessions where business_id=${scope.businessId} and app_instance_id=${instanceId} and status='open' and ${capabilityId}='ordering.table_service' union all select 1 from kitchen_devices where business_id=${scope.businessId} and app_instance_id=${instanceId} and revoked_at is null and expires_at>now() and ${capabilityId}='ordering.kitchen' limit 1`);
          if (inUse !== null) throw new AppError("capability_in_use");
        }
        await tx.execute(sql`insert into app_instance_capabilities(business_id,app_instance_id,capability_id,version,enabled,config)
          values(${scope.businessId},${instanceId},${capabilityId},${selected.version},${selected.enabled},${JSON.stringify(selected.config)}::jsonb)
          on conflict(business_id,app_instance_id,capability_id) do update set version=excluded.version,enabled=excluded.enabled,config=excluded.config`);
        return read(tx, scope, instanceId);
      });
    } catch (error) {
      if (error instanceof CapabilityValidationError)
        throw new AppError("validation_failed", { reason: error.message });
      throw error;
    }
  }
  return { catalog: getCapabilityCatalog, get, set };
}
