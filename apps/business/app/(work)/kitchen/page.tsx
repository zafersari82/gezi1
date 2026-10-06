import { branchSchema, orderSchema } from "@vado/contracts";
import { z } from "zod";

import { KitchenView } from "../../../components/kitchen-view";
import { apiGet } from "../../../lib/api";
import { getBusinessContext } from "../../../lib/context";
export default async function KitchenPage() {
  const context = await getBusinessContext();
  const instance = context.instance;
  if (
    instance === null ||
    !context.resolved?.capabilities.some((c) => c.startsWith("ordering.kitchen@"))
  )
    return <p role="alert">Bu uygulama kaydında mutfak paketi açık değil.</p>;
  const branches = (
    await apiGet(
      z.object({ items: z.array(branchSchema) }),
      `/v1/business/${context.membership.businessId}/branches`,
    )
  ).items;
  const branch = branches.find((b) => b.active);
  const query = new URLSearchParams({ active: "true", limit: "50", appInstanceId: instance.id });
  if (branch) query.set("branchId", branch.id);
  const initial = await apiGet(
    z.object({ items: z.array(orderSchema), nextCursor: z.string().nullable() }),
    `/v1/business/${context.membership.businessId}/kitchen-queue?${query}`,
  );
  return (
    <KitchenView
      businessId={context.membership.businessId}
      appInstanceId={instance.id}
      branches={branches.filter((b) => b.active)}
      initial={initial}
      title="Mutfak"
    />
  );
}
