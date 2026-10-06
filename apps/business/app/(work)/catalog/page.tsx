import { branchSchema, catalogSchema } from "@vado/contracts";
import { z } from "zod";

import { CatalogView } from "../../../components/catalog-view";
import { apiGet } from "../../../lib/api";
import { getBusinessContext } from "../../../lib/context";

export default async function CatalogPage() {
  const { membership } = await getBusinessContext();
  const catalog = await apiGet(catalogSchema, `/v1/business/${membership.businessId}/catalog`);
  const branches = (
    await apiGet(
      z.object({ items: z.array(branchSchema) }),
      `/v1/business/${membership.businessId}/branches`,
    )
  ).items;
  return (
    <CatalogView
      key={membership.businessId}
      initial={catalog}
      branches={branches}
      canWrite={membership.role !== "staff"}
    />
  );
}
