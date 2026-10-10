import "server-only";

import {
  appInstanceSchema,
  businessMembershipSchema,
  type BusinessPermission,
  engineCapabilityCatalogSchema,
  instanceCapabilitiesSchema,
  myBusinessAccessSchema,
} from "@vado/contracts";
import { redirect } from "next/navigation";
import { cache } from "react";
import { z } from "zod";

import { apiGet, BusinessApiError } from "./api";
import { BUSINESS_COOKIE, INSTANCE_COOKIE, readSelection } from "./session";

export const getMemberships = cache(async () => {
  try {
    return (
      await apiGet(
        z.object({ items: z.array(businessMembershipSchema) }),
        "/v1/business/memberships",
      )
    ).items;
  } catch (error) {
    if (error instanceof BusinessApiError && error.status === 401) redirect("/login");
    throw error;
  }
});
export const getBusinessContext = cache(async () => {
  const memberships = await getMemberships();
  const selected = await readSelection(BUSINESS_COOKIE);
  const membership =
    selected === null ? memberships[0] : memberships.find((m) => m.businessId === selected);
  if (membership === undefined) redirect("/businesses");
  const canBook =
    membership.businessCategory === "beauty" || membership.businessCategory === "health";
  const instances = (
    await apiGet(
      z.object({ items: z.array(appInstanceSchema) }),
      `/v1/business/${membership.businessId}/app-instances`,
    )
  ).items;
  const chosen = await readSelection(INSTANCE_COOKIE);
  const instance =
    instances.find((i) => i.active && i.id === chosen) ?? instances.find((i) => i.active);
  const resolved =
    instance === undefined
      ? null
      : await apiGet(
          instanceCapabilitiesSchema,
          `/v1/business/${membership.businessId}/app-instances/${instance.id}/capabilities`,
        );
  const catalog = await apiGet(engineCapabilityCatalogSchema, "/v1/capabilities", false);
  // Randevu işletmesinde, yalnız örnek uygulama örneği var diye sipariş menüsü açılmaz; şube ve
  // ayarlar ise her işletmede görünür. Uygulama örneği olmayan işletme çekirdek bölümleri görür.
  const orderingEnabled =
    resolved !== null &&
    (!canBook || resolved.settings.some((setting) => setting.capabilityId.startsWith("ordering.")));
  const coreBlocks = catalog.engines[0]?.businessBlocks ?? [];
  const blocks = orderingEnabled
    ? resolved.businessBlocks
    : canBook
      ? coreBlocks.filter((block) => block.view === "branches" || block.view === "settings")
      : coreBlocks;
  return {
    membership,
    canBook,
    instances,
    instance: instance ?? null,
    blocks,
    capabilities: catalog,
    resolved,
  };
});

/** Oturumdaki kişinin bu işletmedeki izinleri; sunucu her istekte ayrıca denetler. */
export const getMyAccess = cache(async () => {
  const { membership } = await getBusinessContext();
  return apiGet(myBusinessAccessSchema, `/v1/business/${membership.businessId}/access/me`);
});

/** İznin geçtiği şubeler: bütün şubelerse `null`, hiç yoksa boş liste. */
export async function permittedBranchIds(permission: BusinessPermission) {
  const access = await getMyAccess();
  const grant = access.permissions.find((item) => item.permission === permission);
  return grant === undefined ? [] : grant.branchIds;
}
