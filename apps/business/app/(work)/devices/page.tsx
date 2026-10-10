import { branchSchema, operationDeviceSchema } from "@vado/contracts";
import { z } from "zod";

import { DevicesView } from "../../../components/devices-view";
import { apiGet } from "../../../lib/api";
import { getBusinessContext } from "../../../lib/context";
export default async function DevicesPage() {
  const c = await getBusinessContext();
  if (!["owner", "manager"].includes(c.membership.role))
    return <p role="alert">Tabletleri yalnızca işletme yöneticisi eşleştirebilir.</p>;
  if (
    c.instance === null ||
    !c.resolved?.capabilities.some((v) => v.startsWith("ordering.kitchen@"))
  )
    return <p role="alert">Önce Ayarlar ekranında mutfak paketini aç.</p>;
  const root = `/v1/business/${c.membership.businessId}`;
  const [branches, devices] = await Promise.all([
    apiGet(z.object({ items: z.array(branchSchema) }), `${root}/branches`),
    apiGet(z.object({ items: z.array(operationDeviceSchema) }), `${root}/devices`),
  ]);
  return (
    <DevicesView initial={devices.items} branches={branches.items} appInstanceId={c.instance.id} />
  );
}
