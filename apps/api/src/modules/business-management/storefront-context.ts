import { studioDesignSchema } from "@vado/contracts";

import type { AppContext } from "../../core/context";
import { sql } from "../../core/database";
import { AppError } from "../../core/errors";
import { type TenantScope, withTenant } from "../../core/tenant-scope";

/** Bütün sektörler aynı yayımlanmış vitrini ve şube görünümünü kullanır. */
export function createStorefrontContext({ db, storage }: Pick<AppContext, "db" | "storage">) {
  function context(scope: TenantScope) {
    if (
      scope.role !== "customer" ||
      scope.appInstanceId === null ||
      scope.businessCustomerId === null
    )
      throw new AppError("forbidden");
    return withTenant(db, scope, async (tx) => {
      const publication = await tx.maybeOne<{ published_design: unknown }>(sql`
        select published_design from business_studio where business_id = ${scope.businessId}
      `);
      const design =
        publication === null || publication.published_design === null
          ? null
          : studioDesignSchema.parse(publication.published_design);
      const ids = [design?.logoMediaId, design?.coverMediaId].filter(
        (id): id is string => typeof id === "string",
      );
      const media =
        ids.length === 0
          ? []
          : await tx.many<{ id: string; storage_key: string }>(sql`
        select id, storage_key from media where id = any(${ids}::uuid[])
      `);
      const publishedUrl = (id: string | null) => {
        const key = media.find((entry) => entry.id === id)?.storage_key;
        return key === undefined ? null : storage.publicUrl(key);
      };
      return {
        businessId: scope.businessId,
        appInstanceId: scope.appInstanceId,
        businessName: (
          await tx.one<{ name: string }>(
            sql`select name from businesses where id=${scope.businessId}`,
          )
        ).name,
        storefront:
          design === null
            ? null
            : {
                ...design,
                logoUrl: publishedUrl(design.logoMediaId),
                coverUrl: publishedUrl(design.coverMediaId),
              },
        capabilities: (
          await tx.one<{ caps: string[] }>(
            sql`select ordering_capabilities_for_instance(${scope.businessId},${scope.appInstanceId}) as caps`,
          )
        ).caps,
        branches: await tx.many(
          sql`select b.id,b.name,b.timezone,b.address,branch_is_open(b.business_id,b.id,now()) as "openNow",coalesce(s.preparation_minutes,20) as "preparationMinutes" from branches b left join branch_ordering_settings s on s.business_id=b.business_id and s.branch_id=b.id where b.business_id=${scope.businessId} and b.active order by b.name,b.id`,
        ),
      };
    });
  }
  return context;
}
