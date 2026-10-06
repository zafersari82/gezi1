import "server-only";

import {
  appInstanceSchema,
  businessMembershipSchema,
  engineCapabilityCatalogSchema,
  instanceCapabilitiesSchema,
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
  const blocks = resolved?.businessBlocks ?? catalog.engines[0]?.businessBlocks ?? [];
  return {
    membership,
    instances,
    instance: instance ?? null,
    blocks,
    capabilities: catalog,
    resolved,
  };
});
