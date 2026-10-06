import { branchSchema } from "@vado/contracts";
import { z } from "zod";

import { BranchesView } from "../../../components/branches-view";
import { apiGet } from "../../../lib/api";
import { getBusinessContext } from "../../../lib/context";
export default async function BranchesPage() {
  const { membership } = await getBusinessContext();
  const branches = (
    await apiGet(
      z.object({ items: z.array(branchSchema) }),
      `/v1/business/${membership.businessId}/branches`,
    )
  ).items;
  return (
    <BranchesView
      key={membership.businessId}
      initial={branches}
      canWrite={membership.role !== "staff"}
    />
  );
}
