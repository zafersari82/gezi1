import { branchSchema, restaurantTableSchema, tableRequestSchema } from "@vado/contracts";
import { z } from "zod";

import { TablesView } from "../../../components/tables-view";
import { apiGet } from "../../../lib/api";
import { getBusinessContext } from "../../../lib/context";
export default async function TablesPage() {
  const c = await getBusinessContext();
  if (
    c.instance === null ||
    !c.resolved?.capabilities.some((v) => v.startsWith("ordering.table_service@"))
  )
    return <p role="alert">Bu uygulama kaydında masa servisi paketi açık değil.</p>;
  const root = `/v1/business/${c.membership.businessId}`;
  const [tables, requests, branches] = await Promise.all([
    apiGet(z.object({ items: z.array(restaurantTableSchema) }), `${root}/tables`),
    apiGet(z.object({ items: z.array(tableRequestSchema) }), `${root}/table-requests`),
    apiGet(z.object({ items: z.array(branchSchema) }), `${root}/branches`),
  ]);
  return (
    <TablesView
      businessId={c.membership.businessId}
      appInstanceId={c.instance.id}
      branches={branches.items}
      initial={tables.items}
      initialRequests={requests.items}
      canWrite={["owner", "manager"].includes(c.membership.role)}
    />
  );
}
