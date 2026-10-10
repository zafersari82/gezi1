import { branchSchema, catalogSchema } from "@vado/contracts";
import { z } from "zod";

import { CatalogView } from "../../../components/catalog-view";
import { apiGet } from "../../../lib/api";
import { getBusinessContext, permittedBranchIds } from "../../../lib/context";

export default async function CatalogPage() {
  const { membership } = await getBusinessContext();
  const catalog = await apiGet(catalogSchema, `/v1/business/${membership.businessId}/catalog`);
  const branches = (
    await apiGet(
      z.object({ items: z.array(branchSchema) }),
      `/v1/business/${membership.businessId}/branches`,
    )
  ).items;
  const availability = await permittedBranchIds("catalog.availability");
  return (
    <CatalogView
      key={membership.businessId}
      initial={catalog}
      branches={branches}
      availabilityBranches={branches.filter(
        (branch) => branch.active && (availability === null || availability.includes(branch.id)),
      )}
      canWrite={membership.role !== "staff"}
    />
  );
}
