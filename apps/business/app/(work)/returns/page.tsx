import { returnRequestSchema } from "@vado/contracts";
import { redirect } from "next/navigation";
import { z } from "zod";

import { ReturnsView } from "../../../components/returns-view";
import { apiGet } from "../../../lib/api";
import { getBusinessContext } from "../../../lib/context";

export default async function ReturnsPage() {
  const { membership } = await getBusinessContext();
  if (membership.role === "staff") redirect("/orders");
  const initial = await apiGet(
    z.object({ items: z.array(returnRequestSchema), nextCursor: z.string().nullable() }),
    `/v1/business/${membership.businessId}/returns?status=pending&limit=30`,
  );
  return <ReturnsView key={membership.businessId} initial={initial} />;
}
