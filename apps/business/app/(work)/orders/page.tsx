import { orderSummarySchema } from "@vado/contracts";
import { z } from "zod";

import { OrdersView } from "../../../components/orders-view";
import { apiGet } from "../../../lib/api";
import { getBusinessContext, permittedBranchIds } from "../../../lib/context";
import { orderListSearch } from "../../../lib/order-query";

export default async function OrdersPage({
  searchParams,
}: {
  searchParams: Promise<{ queue?: string }>;
}) {
  const context = await getBusinessContext();
  const queue = (await searchParams).queue;
  const block = context.blocks.find(
    (b) =>
      queue !== undefined &&
      new URL(b.path, "https://vado.invalid").searchParams.get("queue") === queue,
  );
  const manageBranchIds = await permittedBranchIds("orders.manage");
  const initial = await apiGet(
    z.object({ items: z.array(orderSummarySchema), nextCursor: z.string().nullable() }),
    `/v1/business/${context.membership.businessId}/orders?${orderListSearch("active", block?.states ?? [])}`,
  );
  return (
    <OrdersView
      key={`${context.membership.businessId}:${queue ?? "all"}`}
      businessId={context.membership.businessId}
      initial={initial}
      title={block?.title ?? "Siparişler"}
      states={block?.states ?? []}
      manageBranchIds={manageBranchIds}
    />
  );
}
