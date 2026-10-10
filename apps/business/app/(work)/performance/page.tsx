import { branchPerformanceSchema } from "@vado/contracts";

import { PerformanceView } from "../../../components/performance-view";
import { apiGet } from "../../../lib/api";
import { getBusinessContext } from "../../../lib/context";

export default async function PerformancePage() {
  const { membership } = await getBusinessContext();
  const initial = await apiGet(
    branchPerformanceSchema,
    `/v1/business/${membership.businessId}/orders/performance?days=30`,
  );
  return <PerformanceView key={membership.businessId} initial={initial} />;
}
